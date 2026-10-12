import base64
import importlib.util
import io
import json
import struct
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
SPEC = importlib.util.spec_from_file_location(
    "youtube_workflow", Path(__file__).parents[1] / "youtube_workflow.py"
)
yt = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(yt)


def png(width=1280, height=720):
    # Only the format/dimension validation is exercised here, not raster decoding.
    return (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", 13)
        + b"IHDR"
        + struct.pack(">II", width, height)
        + b"\x08\x02\x00\x00\x00"
        + b"\x00" * 4
        + b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def data_url(data=None):
    return "data:image/png;base64," + base64.b64encode(data or png()).decode()


@pytest.fixture
def workflow(tmp_path):
    return yt.YouTubeWorkflow(tmp_path)


@pytest.mark.parametrize(
    "url",
    [
        "https://www.youtube.com/watch?v=tLYeRFi-A-k&t=3",
        "https://youtu.be/tLYeRFi-A-k?si=tracking",
        "https://youtube.com/shorts/tLYeRFi-A-k",
        "https://m.youtube.com/live/tLYeRFi-A-k",
    ],
)
def test_video_url_is_normalized(url):
    assert yt.video_id(url) == "tLYeRFi-A-k"


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/admin",
        "https://youtube.com.evil.test/watch?v=tLYeRFi-A-k",
        "https://evil.test/@youtube.com/watch?v=tLYeRFi-A-k",
        "https://user:pass@youtube.com/watch?v=tLYeRFi-A-k",
        "https://youtube.com:443/watch?v=tLYeRFi-A-k",
        "file:///etc/passwd",
        "https://youtube.com/watch?v=bad",
        "https://youtube.com/watch?v=tLYeRFi-A-k&v=iSj58QdS4O8",
    ],
)
def test_only_single_public_youtube_video_urls_are_accepted(url):
    with pytest.raises(yt.YouTubeError):
        yt.video_id(url)


def test_public_import_uses_fixed_hosts_and_exposes_context_limit(workflow):
    metadata = {
        "title": "Ma vidéo",
        "author_name": "Franck",
        "thumbnail_url": "http://evil.test/secret",
    }
    with (
        patch.object(yt, "request_json", return_value=metadata),
        patch.object(yt, "request_bytes", return_value=png()) as download,
    ):
        result = workflow.import_video("https://youtu.be/tLYeRFi-A-k")
    assert result["id"] == "tLYeRFi-A-k"
    assert result["contextSource"] == "title"
    assert result["description"] == ""
    assert result["reference"].startswith("data:image/png;base64,")
    assert all(
        call.args[0].startswith("https://i.ytimg.com/vi/tLYeRFi-A-k/")
        for call in download.call_args_list
    )


def test_oauth_uses_pkce_state_and_fixed_google_endpoints(workflow):
    workflow.configure(
        {
            "installed": {
                "client_id": "test.apps.googleusercontent.com",
                "client_secret": "secret",
                "auth_uri": "https://evil.test",
            }
        }
    )
    result = workflow.start_auth(8790)
    from urllib.parse import urlsplit, parse_qs

    url = urlsplit(result["url"])
    query = parse_qs(url.query)
    assert url.netloc == "accounts.google.com"
    assert query["code_challenge_method"] == ["S256"]
    assert query["redirect_uri"] == ["http://127.0.0.1:8790/api/youtube/oauth/callback"]
    assert len(query["state"][0]) >= 32
    assert "secret" not in result["url"]
    with patch.object(yt, "request_json") as exchange:
        with pytest.raises(yt.YouTubeError):
            workflow.finish_auth({"state": ["wrong"], "code": ["code"]})
    exchange.assert_not_called()
    assert "secret" not in json.dumps(workflow.status())
    assert (workflow.root / "client.json").stat().st_mode & 0o777 == 0o600


def test_oauth_callback_is_single_use_and_tokens_are_private(workflow):
    workflow.configure(
        {
            "installed": {
                "client_id": "test.apps.googleusercontent.com",
                "client_secret": "secret",
            }
        }
    )
    workflow.start_auth(8790)
    state = workflow.pending["state"]
    with patch.object(
        yt,
        "request_json",
        return_value={
            "access_token": "access-private",
            "refresh_token": "refresh-private",
            "expires_in": 3600,
        },
    ):
        workflow.finish_auth({"state": [state], "code": ["code"]})
    assert workflow.status()["connected"] is True
    assert "private" not in json.dumps(workflow.status())
    with pytest.raises(yt.YouTubeError):
        workflow.finish_auth({"state": [state], "code": ["code"]})
    assert (workflow.root / "tokens.json").stat().st_mode & 0o777 == 0o600


def test_exact_bytes_and_video_must_be_approved_before_install(workflow):
    staged = workflow.stage(
        {"videoId": "tLYeRFi-A-k", "image": data_url(), "title": "Titre"}
    )
    with patch.object(workflow, "_api") as api:
        with pytest.raises(yt.YouTubeError, match="valid"):
            workflow.install(staged["id"])
        with pytest.raises(yt.YouTubeError):
            workflow.approve(staged["id"], "iSj58QdS4O8", staged["sha256"])
        with pytest.raises(yt.YouTubeError):
            workflow.approve(staged["id"], "tLYeRFi-A-k", "0" * 64)
    api.assert_not_called()
    approved = workflow.approve(staged["id"], "tLYeRFi-A-k", staged["sha256"])
    assert approved["status"] == "approved"


def test_tampered_or_expired_approval_cannot_be_installed(workflow):
    staged = workflow.stage({"videoId": "tLYeRFi-A-k", "image": data_url()})
    workflow.approve(staged["id"], staged["videoId"], staged["sha256"])
    (workflow.root / "reviews" / f"{staged['id']}.image").write_bytes(png(640, 360))
    with patch.object(workflow, "_api") as api:
        with pytest.raises(yt.YouTubeError, match="modifi"):
            workflow.install(staged["id"])
    api.assert_not_called()


def test_install_checks_ownership_and_is_idempotent(workflow):
    staged = workflow.stage({"videoId": "tLYeRFi-A-k", "image": data_url()})
    workflow.approve(staged["id"], staged["videoId"], staged["sha256"])
    responses = [
        {
            "items": [
                {
                    "id": "tLYeRFi-A-k",
                    "snippet": {"channelId": "mine", "title": "Titre réel"},
                }
            ]
        },
        {"items": [{"id": "mine", "snippet": {"title": "Franck MAHIA"}}]},
        {
            "items": [
                {"default": {"url": "https://i.ytimg.com/vi/tLYeRFi-A-k/default.jpg"}}
            ]
        },
    ]
    with patch.object(workflow, "_api", side_effect=responses) as api:
        result = workflow.install(staged["id"])
        repeat = workflow.install(staged["id"])
    assert result["status"] == "installed"
    assert repeat == result
    assert api.call_count == 3
    assert api.call_args_list[-1].kwargs["body"] == png()
    assert api.call_args_list[-1].args[0].endswith("/thumbnails/set")


def test_wrong_channel_blocks_upload(workflow):
    staged = workflow.stage({"videoId": "tLYeRFi-A-k", "image": data_url()})
    workflow.approve(staged["id"], staged["videoId"], staged["sha256"])
    with patch.object(
        workflow,
        "_api",
        side_effect=[
            {"items": [{"snippet": {"channelId": "other"}}]},
            {"items": [{"id": "mine"}]},
        ],
    ) as api:
        with pytest.raises(yt.YouTubeError, match="chaîne"):
            workflow.install(staged["id"])
    assert api.call_count == 2


def test_upload_timeout_does_not_allow_automatic_retry(workflow):
    staged = workflow.stage({"videoId": "tLYeRFi-A-k", "image": data_url()})
    workflow.approve(staged["id"], staged["videoId"], staged["sha256"])
    with patch.object(
        workflow,
        "_api",
        side_effect=[
            {"items": [{"snippet": {"channelId": "mine"}}]},
            {"items": [{"id": "mine"}]},
            TimeoutError(),
        ],
    ):
        with pytest.raises(yt.YouTubeError, match="incertain"):
            workflow.install(staged["id"])
    with patch.object(workflow, "_api") as api:
        with pytest.raises(yt.YouTubeError, match="incertain"):
            workflow.install(staged["id"])
    api.assert_not_called()


@pytest.mark.parametrize(
    "image",
    [
        data_url(png(640, 360)),
        "data:image/svg+xml;base64,PHN2Zz4=",
        data_url(b"<html>"),
    ],
)
def test_invalid_export_cannot_be_staged(workflow, image):
    with pytest.raises(yt.YouTubeError):
        workflow.stage({"videoId": "tLYeRFi-A-k", "image": image})


@pytest.mark.parametrize(
    "failure", [yt.YouTubeError("JSON invalide", 502), TimeoutError(), {"items": []}]
)
def test_ambiguous_upload_stays_blocked_after_restart(workflow, failure):
    staged = workflow.stage({"videoId": "tLYeRFi-A-k", "image": data_url()})
    workflow.approve(staged["id"], staged["videoId"], staged["sha256"])
    with patch.object(
        workflow,
        "_api",
        side_effect=[
            {"items": [{"snippet": {"channelId": "mine"}}]},
            {"items": [{"id": "mine"}]},
            failure,
        ],
    ):
        with pytest.raises(yt.YouTubeError):
            workflow.install(staged["id"])
    restarted = yt.YouTubeWorkflow(workflow.root)
    assert restarted.review(staged["id"])["status"] == "uncertain"
    with (
        patch.object(restarted, "_api") as api,
        pytest.raises(yt.YouTubeError, match="incertain"),
    ):
        restarted.install(staged["id"])
    api.assert_not_called()


def test_expired_approval_never_calls_youtube(workflow):
    staged = workflow.stage({"videoId": "tLYeRFi-A-k", "image": data_url()})
    workflow.approve(staged["id"], staged["videoId"], staged["sha256"])
    record = workflow._review(staged["id"])
    record["expires"] = 0
    workflow._save(f"reviews/{staged['id']}.json", record)
    with (
        patch.object(workflow, "_api") as api,
        pytest.raises(yt.YouTubeError, match="30 minutes"),
    ):
        workflow.install(staged["id"])
    api.assert_not_called()


def test_only_desktop_google_clients_are_accepted(workflow):
    with pytest.raises(yt.YouTubeError):
        workflow.configure(
            {
                "web": {
                    "client_id": "test.apps.googleusercontent.com",
                    "client_secret": "secret",
                }
            }
        )
    assert workflow.status()["configured"] is False


def test_insufficient_google_scopes_are_not_stored(workflow):
    with pytest.raises(yt.YouTubeError, match="autorisations"):
        workflow._store_tokens(
            {
                "access_token": "private",
                "scope": "https://www.googleapis.com/auth/youtube.readonly",
            }
        )
    assert workflow.status()["connected"] is False


@pytest.mark.parametrize("expires", ["invalid", {}, -1])
def test_bad_token_expiry_is_actionable(workflow, expires):
    with pytest.raises(yt.YouTubeError):
        workflow._store_tokens({"access_token": "private", "expires_in": expires})


def test_google_http_server_failure_is_uncertain(workflow):
    from urllib.error import HTTPError

    workflow._save("tokens.json", {"access_token": "private", "expires": 9999999999})
    with patch.object(
        yt,
        "request_json",
        side_effect=HTTPError(yt.UPLOAD, 503, "busy", {}, io.BytesIO(b"{}")),
    ):
        with pytest.raises(yt.YouTubeError) as failure:
            workflow._api(yt.UPLOAD, {}, body=png(), mime="image/png")
    assert not failure.value.definitive
