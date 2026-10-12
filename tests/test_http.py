import importlib.util
import json
import threading
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

SPEC = importlib.util.spec_from_file_location(
    "studio_http", Path(__file__).parents[1] / "server.py"
)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


@pytest.fixture
def studio(monkeypatch, tmp_path):
    monkeypatch.setattr(server, "YOUTUBE", server.YouTubeWorkflow(tmp_path))
    monkeypatch.setattr(
        server, "codex_status", lambda: {"installed": True, "connected": True}
    )
    monkeypatch.setattr(server, "api_key", lambda: "")
    httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    worker = threading.Thread(target=httpd.serve_forever, daemon=True)
    worker.start()
    yield f"http://127.0.0.1:{httpd.server_port}"
    httpd.shutdown()
    httpd.server_close()
    worker.join()


def test_public_app_and_private_file_boundary(studio):
    with urlopen(studio) as response:
        assert response.status == 200
        assert b"Thumbnail Studio" in response.read()
        assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    for path in [
        "/.env",
        "/server.py",
        "/../AGENTS.md",
        "/.runtime/probe/events.jsonl",
    ]:
        with pytest.raises(HTTPError) as error:
            urlopen(studio + path)
        assert error.value.code == 404


def test_status_exposes_connection_state_without_credentials(studio):
    with urlopen(studio + "/api/status") as response:
        data = json.load(response)
    assert data["codex"]["connected"] is True
    assert data["configured"] is False
    assert "key" not in data


def test_cross_origin_request_cannot_trigger_a_generation(studio):
    request = Request(
        studio + "/api/codex/generate",
        data=b'{"title":"Test"}',
        headers={
            "Origin": "https://untrusted.example",
            "Content-Type": "application/json",
        },
    )
    with pytest.raises(HTTPError) as error:
        urlopen(request)
    assert error.value.code == 403


def test_invalid_brief_and_absent_api_key_are_actionable(studio):
    for body, expected in [
        (b"invalid json", 400),
        (b"{}", 400),
        (b'{"title":"Test"}', 503),
    ]:
        request = Request(
            studio + "/api/generate",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with pytest.raises(HTTPError) as error:
            urlopen(request)
        assert error.value.code == expected
        assert "error" in json.load(error.value)


def post(studio, action, payload):
    request = Request(
        studio + "/api/youtube/" + action,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urlopen(request) as response:
        return json.load(response)


def test_review_routes_preserve_exact_pixels_and_require_approval(studio):
    import base64

    data = (
        Path(__file__).parents[1] / "examples/youtube-tLYeRFi-A-k/miniature-impact.jpg"
    ).read_bytes()
    staged = post(
        studio,
        "stage",
        {
            "videoId": "tLYeRFi-A-k",
            "image": "data:image/jpeg;base64," + base64.b64encode(data).decode(),
        },
    )
    with urlopen(studio + staged["imageUrl"]) as response:
        assert response.read() == data
    with pytest.raises(HTTPError) as failure:
        post(studio, "install", {"id": staged["id"]})
    assert failure.value.code == 409
    approved = post(
        studio,
        "approve",
        {"id": staged["id"], "videoId": staged["videoId"], "sha256": staged["sha256"]},
    )
    assert approved["status"] == "approved"
    with pytest.raises(HTTPError) as failure:
        post(studio, "install", {"id": staged["id"]})
    assert failure.value.code == 401


@pytest.mark.parametrize(
    "route",
    ["configure", "connect", "disconnect", "stage", "approve", "install", "import"],
)
def test_cross_origin_youtube_actions_are_blocked(studio, route):
    request = Request(
        studio + "/api/youtube/" + route,
        data=b"{}",
        headers={"Content-Type": "application/json", "Origin": "https://evil.test"},
    )
    with pytest.raises(HTTPError) as failure:
        urlopen(request)
    assert failure.value.code == 403


def test_google_guide_and_callback_fail_safely_without_client(studio):
    with urlopen(studio) as response:
        html = response.read().decode()
    assert "Application de bureau" in html
    assert "utilisateurs test" in html
    with pytest.raises(HTTPError) as failure:
        post(studio, "connect", {})
    assert failure.value.code == 409
    with pytest.raises(HTTPError) as failure:
        urlopen(studio + "/api/youtube/oauth/callback?state=wrong&code=private-code")
    assert failure.value.code == 400
    assert b"private-code" not in failure.value.read()


def test_missing_review_image_returns_not_found(studio):
    identifier = "a" * 32
    server.YOUTUBE._save(
        f"reviews/{identifier}.json",
        {"id": identifier, "status": "pending", "mime": "image/png"},
    )
    with pytest.raises(HTTPError) as failure:
        urlopen(f"{studio}/api/youtube/reviews/{identifier}/image")
    assert failure.value.code == 404
    assert "error" in json.load(failure.value)
