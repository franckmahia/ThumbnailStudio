import base64
import importlib.util
import io
import json
from pathlib import Path
from unittest.mock import patch

import pytest

SPEC = importlib.util.spec_from_file_location(
    "thumbnail_server", Path(__file__).parents[1] / "server.py"
)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)
PNG = base64.b64encode(b"\x89PNG\r\n\x1a\nexample").decode()


def test_brief_is_required_and_bounded():
    for payload in [{}, {"title": " "}, {"title": "x" * 301}, []]:
        with pytest.raises(server.ClientError):
            server.validate_brief(payload)


def test_prompt_keeps_the_brief_but_requests_no_rendered_text():
    brief = server.validate_brief(
        {
            "title": "Une IA utile",
            "description": "Un atelier de réparation",
            "style": "editorial",
        }
    )
    prompt = server.build_prompt(brief)
    assert "atelier de réparation" in prompt
    assert "Une IA utile" in prompt
    assert "NO text" in prompt
    assert "left" in prompt


def test_unknown_style_and_oversized_description_are_rejected():
    for values in [{"style": "unknown"}, {"description": "x" * 4001}]:
        with pytest.raises(server.ClientError):
            server.validate_brief({"title": "Test", **values})


def test_generation_is_unavailable_without_a_key(monkeypatch):
    monkeypatch.delenv("THUMBNAIL_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(server.ClientError, match="clé API"):
        server.generate_image(server.validate_brief({"title": "Test"}))


def test_provider_request_has_one_image_and_secret_stays_server_side(monkeypatch):
    monkeypatch.setenv("THUMBNAIL_API_KEY", "test-secret")
    response = io.BytesIO(json.dumps({"data": [{"b64_json": PNG}]}).encode())
    with patch.object(server, "urlopen", return_value=response) as request:
        output = server.generate_image(server.validate_brief({"title": "Test"}))
    sent = request.call_args.args[0]
    assert json.loads(sent.data)["n"] == 1
    assert sent.get_header("Authorization") == "Bearer test-secret"
    assert output["image"].startswith("data:image/png;base64,")
    assert "test-secret" not in json.dumps(output)


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"data": []},
        {"data": [{"b64_json": "bad!"}]},
        {"data": [{"b64_json": base64.b64encode(b"html").decode()}]},
    ],
)
def test_invalid_provider_images_are_reported(monkeypatch, data):
    monkeypatch.setenv("THUMBNAIL_API_KEY", "test-secret")
    response = io.BytesIO(json.dumps(data).encode())
    with patch.object(server, "urlopen", return_value=response):
        with pytest.raises(server.ClientError, match="image"):
            server.generate_image(server.validate_brief({"title": "Test"}))


def test_only_same_origin_local_requests_are_accepted():
    assert server.allowed_request("127.0.0.1:8790", "http://127.0.0.1:8790", 8790)
    assert server.allowed_request("localhost:8790", None, 8790)
    assert not server.allowed_request("evil.test:8790", None, 8790)
    assert not server.allowed_request("127.0.0.1:8790", "https://evil.test", 8790)
    assert not server.allowed_request("127.0.0.1:8790", "http://127.0.0.1:9999", 8790)


def test_environment_file_does_not_override_existing_keys(tmp_path, monkeypatch):
    monkeypatch.setenv("THUMBNAIL_MODEL", "existing")
    path = tmp_path / ".env"
    path.write_text('THUMBNAIL_MODEL="other"\nTHUMBNAIL_SIZE=1536x1024\n')
    server.load_env(path)
    assert server.os.environ["THUMBNAIL_MODEL"] == "existing"
    assert server.os.environ["THUMBNAIL_SIZE"] == "1536x1024"


def test_native_codex_uses_chatgpt_without_api_fallback(tmp_path, monkeypatch):
    from types import SimpleNamespace

    image = tmp_path / "generated_images" / "thread-123" / "image.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(base64.b64decode(PNG))
    monkeypatch.setattr(server, "GENERATED_ROOT", tmp_path / "generated_images")
    monkeypatch.setattr(server, "RUNTIME", tmp_path / "runtime")
    monkeypatch.setattr(server, "codex_binary", lambda: "/test/codex")
    monkeypatch.setenv("OPENAI_API_KEY", "must-not-reach-codex")
    events = [
        {"type": "thread.started", "thread_id": "thread-123"},
        {
            "type": "item.completed",
            "item": {"type": "agent_message", "text": str(image)},
        },
        {"type": "turn.completed"},
    ]
    completed = SimpleNamespace(
        returncode=0, stdout="\n".join(json.dumps(x) for x in events)
    )
    with patch.object(server.subprocess, "run", return_value=completed) as run:
        result = server.generate_codex_image(server.validate_brief({"title": "Test"}))
    args = run.call_args.args[0]
    assert args[0] == "/test/codex"
    assert "--ignore-user-config" in args
    assert "--ephemeral" in args
    assert "features.shell_tool=false" in args
    assert "OPENAI_API_KEY" not in run.call_args.kwargs["env"]
    assert "NO text" in run.call_args.kwargs["input"]
    assert result["image"].startswith("data:image/png;base64,")


def test_native_result_cannot_read_an_unrelated_file(tmp_path, monkeypatch):
    from types import SimpleNamespace

    unrelated = tmp_path / "secret.png"
    unrelated.write_bytes(base64.b64decode(PNG))
    monkeypatch.setattr(server, "GENERATED_ROOT", tmp_path / "generated_images")
    monkeypatch.setattr(server, "RUNTIME", tmp_path / "runtime")
    monkeypatch.setattr(server, "codex_binary", lambda: "/test/codex")
    events = [
        {"type": "thread.started", "thread_id": "thread-123"},
        {
            "type": "item.completed",
            "item": {"type": "agent_message", "text": str(unrelated)},
        },
    ]
    with patch.object(
        server.subprocess,
        "run",
        return_value=SimpleNamespace(
            returncode=0, stdout="\n".join(json.dumps(x) for x in events)
        ),
    ):
        with pytest.raises(server.ClientError, match="image"):
            server.generate_codex_image(server.validate_brief({"title": "Test"}))


def test_portrait_requires_explicit_confirmation_and_is_attached_as_pixels(
    tmp_path, monkeypatch
):
    import struct
    from types import SimpleNamespace

    raw = (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", 13)
        + b"IHDR"
        + struct.pack(">II", 1280, 720)
        + b"\x08\x02\x00\x00\x00"
        + b"\x00" * 4
        + b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    reference = "data:image/png;base64," + base64.b64encode(raw).decode()
    values = {
        "title": "Projet IA",
        "reference": reference,
        "complete": True,
        "headline": "COMMENCEZ ICI.",
    }
    with pytest.raises(server.ClientError, match="visage"):
        server.validate_brief(values)
    brief = server.validate_brief({**values, "referenceConfirmed": True})
    image = tmp_path / "generated_images" / "thread-123" / "image.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(raw)
    monkeypatch.setattr(server, "GENERATED_ROOT", tmp_path / "generated_images")
    monkeypatch.setattr(server, "RUNTIME", tmp_path / "runtime")
    monkeypatch.setattr(server, "codex_binary", lambda: "/test/codex")

    def native(args, **kwargs):
        attached = Path(args[args.index("--image") + 1])
        assert attached.read_bytes() == raw
        assert args[args.index("--image") + 2] == "--json"
        assert "Preserve the recognizable face" in kwargs["input"]
        assert "COMMENCEZ ICI." in kwargs["input"]
        return SimpleNamespace(
            returncode=0,
            stdout=json.dumps({"type": "thread.started", "thread_id": "thread-123"})
            + "\n"
            + json.dumps(
                {
                    "type": "item.completed",
                    "item": {"type": "agent_message", "text": str(image)},
                }
            ),
        )

    with patch.object(server.subprocess, "run", side_effect=native):
        output = server.generate_codex_image(brief)
    assert output["renderMode"] == "complete"
