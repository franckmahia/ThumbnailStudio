"""Official Google OAuth + reviewed thumbnail installation, local private storage."""

import base64
import binascii
import hashlib
import json
import os
import re
import secrets
import struct
import threading
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

API = "https://www.googleapis.com/youtube/v3"
UPLOAD = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"
TOKEN = "https://oauth2.googleapis.com/token"
SCOPES = "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload"
ID = re.compile(r"[A-Za-z0-9_-]{11}")
MAX_IMAGE = 2 * 1024 * 1024


class YouTubeError(Exception):
    def __init__(self, message, status=400, *, definitive=False):
        super().__init__(message)
        self.status = status
        self.definitive = definitive


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise YouTubeError("Redirection distante inattendue.", 502)


def request_bytes(url, *, data=None, headers=None, method=None, limit=4 * 1024 * 1024):
    req = Request(
        url,
        data=data,
        headers={"User-Agent": "ThumbnailStudio/2.0", **(headers or {})},
        method=method,
    )
    with build_opener(NoRedirect).open(req, timeout=30) as response:
        content = response.read(limit + 1)
    if len(content) > limit:
        raise YouTubeError("La réponse distante est trop volumineuse.", 502)
    return content


def request_json(url, **kwargs):
    try:
        return json.loads(request_bytes(url, **kwargs))
    except (ValueError, UnicodeDecodeError):
        raise YouTubeError("Réponse distante invalide.", 502) from None


def video_id(value):
    if not isinstance(value, str) or len(value) > 2000:
        raise YouTubeError("Colle le lien d’une vidéo YouTube.")
    try:
        parsed = urlsplit(value.strip())
        if (
            parsed.scheme != "https"
            or parsed.username
            or parsed.password
            or parsed.port
        ):
            raise ValueError()
        host = parsed.hostname
        if host == "youtu.be":
            candidate = parsed.path.removeprefix("/")
        elif host in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
            if parsed.path == "/watch":
                values = parse_qs(parsed.query).get("v", [])
                candidate = values[0] if len(values) == 1 else ""
            else:
                match = re.fullmatch(
                    r"/(?:shorts|live|embed)/([A-Za-z0-9_-]{11})/?", parsed.path
                )
                candidate = match[1] if match else ""
        else:
            raise ValueError()
        if not ID.fullmatch(candidate):
            raise ValueError()
        return candidate
    except ValueError:
        raise YouTubeError(
            "Utilise le lien HTTPS d’une seule vidéo YouTube (watch, youtu.be, shorts ou live)."
        ) from None


def checked_id(value):
    if not isinstance(value, str) or not ID.fullmatch(value):
        raise YouTubeError("Identifiant vidéo invalide.")
    return value


def image_info(data):
    if (
        data.startswith(b"\x89PNG\r\n\x1a\n")
        and len(data) >= 45
        and data[12:16] == b"IHDR"
        and data.endswith(b"IEND\xaeB`\x82")
    ):
        return "image/png", struct.unpack(">II", data[16:24])
    if data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9"):
        pos = 2
        while pos + 4 <= len(data):
            if data[pos] != 255:
                break
            marker = data[pos + 1]
            pos += 2
            if marker == 255:
                pos -= 1
                continue
            if marker in {0xD8, 0xD9}:
                continue
            length = int.from_bytes(data[pos : pos + 2], "big")
            if length < 2 or pos + length > len(data):
                break
            if marker in {0xC0, 0xC1, 0xC2} and length >= 7:
                height, width = struct.unpack(">HH", data[pos + 3 : pos + 7])
                return "image/jpeg", (width, height)
            pos += length
    raise YouTubeError("Choisis une image PNG ou JPG valide.")


def decode_image(value, *, export=False):
    if not isinstance(value, str) or len(value) > 12 * 1024 * 1024:
        raise YouTubeError("L’image est trop volumineuse.")
    match = re.fullmatch(r"data:(image/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)", value)
    if not match:
        raise YouTubeError("Choisis une image PNG ou JPG valide.")
    try:
        data = base64.b64decode(match[2], validate=True)
    except binascii.Error:
        raise YouTubeError("Image encodée invalide.") from None
    mime, size = image_info(data)
    if (
        mime != match[1]
        or min(size) <= 0
        or max(size) > 10000
        or size[0] * size[1] > 60000000
    ):
        raise YouTubeError("Format ou dimensions de l’image invalides.")
    if len(data) > (MAX_IMAGE if export else 8 * 1024 * 1024):
        raise YouTubeError(
            "L’export doit rester sous 2 Mo."
            if export
            else "Portrait trop volumineux (8 Mo maximum)."
        )
    if export and size != (1280, 720):
        raise YouTubeError("La miniature doit être exportée en 1280 × 720.")
    return data, mime


def private_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    temp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with os.fdopen(
            os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb"
        ) as file:
            file.write(data)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


class YouTubeWorkflow:
    def __init__(self, root):
        self.root = Path(root)
        self.pending = None
        self.lock = threading.RLock()

    def _read(self, name):
        try:
            return json.loads((self.root / name).read_text())
        except (OSError, ValueError):
            return {}

    def _save(self, name, value):
        private_write(self.root / name, json.dumps(value, ensure_ascii=False).encode())

    def status(self):
        with self.lock:
            return {
                "configured": bool(self._read("client.json").get("client_id")),
                "connected": bool(
                    self._read("tokens.json").get("refresh_token")
                    or self._read("tokens.json").get("access_token")
                ),
                "waiting": bool(self.pending and self.pending["expires"] > time.time()),
            }

    def configure(self, payload):
        client = payload.get("installed", {}) if isinstance(payload, dict) else {}
        if (
            not isinstance(client, dict)
            or not re.fullmatch(
                r"[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com",
                str(client.get("client_id", "")),
            )
            or not isinstance(client.get("client_secret"), str)
            or not 0 < len(client["client_secret"]) < 300
        ):
            raise YouTubeError(
                "Importe le JSON d’un client OAuth Google de type « Application de bureau »."
            )
        with self.lock:
            self._save(
                "client.json",
                {key: client[key] for key in ["client_id", "client_secret"]},
            )
            (self.root / "tokens.json").unlink(missing_ok=True)
            self.pending = None
        return self.status()

    def start_auth(self, port):
        with self.lock:
            client = self._read("client.json")
            if not client:
                raise YouTubeError(
                    "Importe d’abord le fichier OAuth Google dans Mon studio.", 409
                )
            verifier = secrets.token_urlsafe(64)
            self.pending = {
                "state": secrets.token_urlsafe(32),
                "verifier": verifier,
                "redirect": f"http://127.0.0.1:{port}/api/youtube/oauth/callback",
                "expires": time.time() + 600,
            }
            params = {
                "client_id": client["client_id"],
                "redirect_uri": self.pending["redirect"],
                "response_type": "code",
                "scope": SCOPES,
                "state": self.pending["state"],
                "code_challenge": base64.urlsafe_b64encode(
                    hashlib.sha256(verifier.encode()).digest()
                )
                .rstrip(b"=")
                .decode(),
                "code_challenge_method": "S256",
                "access_type": "offline",
                "prompt": "consent",
            }
            return {
                "url": "https://accounts.google.com/o/oauth2/v2/auth?"
                + urlencode(params)
            }

    def finish_auth(self, query):
        with self.lock:
            states, codes = query.get("state", []), query.get("code", [])
            pending = self.pending
            if (
                not pending
                or len(states) != 1
                or pending["expires"] < time.time()
                or not secrets.compare_digest(states[0], pending["state"])
            ):
                raise YouTubeError(
                    "Connexion expirée ou non reconnue. Reconnecte YouTube."
                )
            self.pending = None
            if query.get("error") or len(codes) != 1 or len(codes[0]) > 4096:
                raise YouTubeError("Connexion YouTube annulée ou refusée.")
            client = self._read("client.json")
            body = {
                **client,
                "code": codes[0],
                "redirect_uri": pending["redirect"],
                "code_verifier": pending["verifier"],
                "grant_type": "authorization_code",
            }
            try:
                tokens = request_json(
                    TOKEN,
                    data=urlencode(body).encode(),
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    method="POST",
                )
                self._store_tokens(tokens)
            except (HTTPError, URLError, TimeoutError):
                raise YouTubeError(
                    "Google n’a pas confirmé la connexion. Reconnecte YouTube.", 502
                ) from None

    def _store_tokens(self, tokens, previous=None):
        if not isinstance(tokens, dict) or not tokens.get("access_token"):
            raise YouTubeError("Connexion Google non confirmée.", 502)
        if "scope" in tokens and not set(SCOPES.split()).issubset(
            str(tokens["scope"]).split()
        ):
            raise YouTubeError(
                "Google n’a pas accordé les autorisations nécessaires. Reconnecte YouTube et accepte les deux accès.",
                403,
            )
        try:
            expires = int(tokens.get("expires_in", 3600))
            if not 60 < expires <= 86400:
                raise ValueError()
        except (ValueError, TypeError):
            raise YouTubeError(
                "Durée de connexion Google invalide. Reconnecte YouTube.", 502
            ) from None
        previous = previous or {}
        self._save(
            "tokens.json",
            {
                "access_token": tokens["access_token"],
                "refresh_token": tokens.get(
                    "refresh_token", previous.get("refresh_token", "")
                ),
                "expires": time.time() + expires - 60,
            },
        )

    def disconnect(self):
        with self.lock:
            # Removes the local grant. Google account permissions can also revoke it.
            (self.root / "tokens.json").unlink(missing_ok=True)
            self.pending = None
        return self.status()

    def _access_token(self):
        with self.lock:
            tokens = self._read("tokens.json")
            if tokens.get("access_token") and tokens.get("expires", 0) > time.time():
                return tokens["access_token"]
            if not tokens.get("refresh_token"):
                raise YouTubeError("Connecte ton compte YouTube dans Mon studio.", 401)
            try:
                refreshed = request_json(
                    TOKEN,
                    data=urlencode(
                        {
                            **self._read("client.json"),
                            "refresh_token": tokens["refresh_token"],
                            "grant_type": "refresh_token",
                        }
                    ).encode(),
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    method="POST",
                )
                self._store_tokens(refreshed, tokens)
                return refreshed["access_token"]
            except (HTTPError, URLError, TimeoutError):
                raise YouTubeError(
                    "Connexion Google expirée. Reconnecte YouTube.", 401
                ) from None

    def _api(self, endpoint, params, *, body=None, mime=None):
        url = (
            (endpoint if endpoint == UPLOAD else API + "/" + endpoint)
            + "?"
            + urlencode(params)
        )
        headers = {"Authorization": "Bearer " + self._access_token()}
        if mime:
            headers["Content-Type"] = mime
        try:
            return request_json(
                url,
                data=body,
                headers=headers,
                method="POST" if body is not None else "GET",
            )
        except HTTPError as exc:
            reasons = []
            try:
                detail = json.loads(exc.read(12000))
                reasons = [
                    e.get("reason") for e in detail.get("error", {}).get("errors", [])
                ]
            except (ValueError, AttributeError):
                pass
            if "accessNotConfigured" in reasons or "serviceDisabled" in reasons:
                message = (
                    "Active YouTube Data API v3 dans le projet Google du client OAuth."
                )
            elif "quotaExceeded" in reasons or "uploadRateLimitExceeded" in reasons:
                message = "Limite YouTube atteinte. Réessaie plus tard, sans nouvel envoi automatique."
            elif exc.code == 401:
                message = "Reconnecte YouTube dans Mon studio."
            elif exc.code == 403:
                message = "YouTube refuse cette action. Vérifie la chaîne choisie, les droits et l’accès aux miniatures personnalisées."
            elif exc.code == 404:
                message = "Vidéo YouTube introuvable ou inaccessible."
            else:
                message = "YouTube a refusé la requête. Aucun nouvel envoi automatique."
            raise YouTubeError(message, 502, definitive=400 <= exc.code < 500) from None

    def import_video(self, url):
        identifier = video_id(url)
        canonical = f"https://www.youtube.com/watch?v={identifier}"
        try:
            if self.status()["connected"]:
                result = self._api("videos", {"part": "snippet", "id": identifier})
                if not result.get("items"):
                    raise YouTubeError("Vidéo introuvable ou inaccessible.")
                snippet = result["items"][0]["snippet"]
                title, author, description = (
                    snippet["title"],
                    snippet.get("channelTitle", ""),
                    snippet.get("description", ""),
                )
                channel = snippet.get("channelId", "")
                context_source = "description"
            else:
                metadata = request_json(
                    "https://www.youtube.com/oembed?"
                    + urlencode({"url": canonical, "format": "json"})
                )
                title, author, description = (
                    metadata["title"],
                    metadata.get("author_name", ""),
                    "",
                )
                channel, context_source = "", "title"
            reference = None
            for size in ["maxresdefault", "hqdefault"]:
                try:
                    data = request_bytes(
                        f"https://i.ytimg.com/vi/{identifier}/{size}.jpg",
                        limit=8 * 1024 * 1024,
                    )
                    mime, dimensions = image_info(data)
                    if dimensions[0] < 320:
                        continue
                    reference = f"data:{mime};base64,{base64.b64encode(data).decode()}"
                    break
                except (HTTPError, YouTubeError):
                    continue
            if not reference:
                raise YouTubeError(
                    "Le sujet est accessible, mais sa miniature ne l’est pas. Réessaie ou importe un portrait."
                )
            return {
                "id": identifier,
                "url": canonical,
                "title": str(title)[:300],
                "channel": str(author)[:100],
                "channelId": channel,
                "description": str(description)[:4000],
                "contextSource": context_source,
                "reference": reference,
            }
        except (HTTPError, URLError, TimeoutError):
            raise YouTubeError(
                "Cette vidéo n’est pas accessible. Vérifie le lien ; pour une vidéo privée, connecte YouTube.",
                502,
            ) from None
        except (KeyError, TypeError, ValueError):
            raise YouTubeError(
                "YouTube n’a pas renvoyé les informations de cette vidéo.", 502
            ) from None

    def _review(self, identifier):
        if not isinstance(identifier, str) or not re.fullmatch(
            r"[a-f0-9]{32}", identifier
        ):
            raise YouTubeError("Validation inconnue.", 404)
        record = self._read(f"reviews/{identifier}.json")
        if not record:
            raise YouTubeError("Validation inconnue.", 404)
        return record

    def review(self, identifier):
        with self.lock:
            record = self._review(identifier)
            return {**record, "imageUrl": f"/api/youtube/reviews/{identifier}/image"}

    def review_image(self, identifier):
        with self.lock:
            record = self._review(identifier)
            try:
                data = (self.root / "reviews" / (identifier + ".image")).read_bytes()
            except OSError:
                raise YouTubeError("Aperçu introuvable.", 404) from None
            return data, record["mime"]

    def stage(self, payload):
        identifier = uuid.uuid4().hex
        video = checked_id(payload.get("videoId"))
        data, mime = decode_image(payload.get("image"), export=True)
        record = {
            "id": identifier,
            "videoId": video,
            "title": str(payload.get("title", ""))[:300],
            "sha256": hashlib.sha256(data).hexdigest(),
            "mime": mime,
            "status": "pending",
            "created": time.time(),
            "expires": time.time() + 1800,
        }
        with self.lock:
            private_write(self.root / "reviews" / (identifier + ".image"), data)
            self._save(f"reviews/{identifier}.json", record)
        return self.review(identifier)

    def approve(self, identifier, video, digest):
        with self.lock:
            record = self._review(identifier)
            if (
                record["status"] != "pending"
                or record["expires"] < time.time()
                or record["videoId"] != video
                or record["sha256"] != digest
            ):
                raise YouTubeError(
                    "Cette validation ne correspond plus au visuel ou à la vidéo. Prépare un nouvel aperçu.",
                    409,
                )
            record.update(status="approved", approvedAt=time.time())
            self._save(f"reviews/{identifier}.json", record)
            return self.review(identifier)

    def install(self, identifier):
        # The lock + persisted state prevent concurrent or repeated media uploads.
        with self.lock:
            record = self._review(identifier)
            if record["status"] == "installed":
                return self.review(identifier)
            if record["status"] in {"installing", "uncertain"}:
                raise YouTubeError(
                    "Résultat incertain : vérifie la miniature dans YouTube Studio avant de préparer un nouvel envoi.",
                    409,
                )
            if record["status"] != "approved" or record["expires"] < time.time():
                raise YouTubeError(
                    "Valide cet aperçu avant de l’installer (validation valable 30 minutes).",
                    409,
                )
            data = (self.root / "reviews" / (identifier + ".image")).read_bytes()
            if hashlib.sha256(data).hexdigest() != record["sha256"]:
                raise YouTubeError(
                    "Le fichier a été modifié après validation. Prépare un nouvel aperçu.",
                    409,
                )
            video = self._api("videos", {"part": "snippet", "id": record["videoId"]})
            channels = self._api("channels", {"part": "snippet", "mine": "true"})
            owned = {item["id"] for item in channels.get("items", [])}
            if (
                not video.get("items")
                or video["items"][0]["snippet"]["channelId"] not in owned
            ):
                raise YouTubeError(
                    "La vidéo n’appartient pas à la chaîne YouTube connectée. Reconnecte la bonne chaîne.",
                    403,
                )
            record.update(
                status="installing",
                targetTitle=video["items"][0]["snippet"].get("title", record["title"]),
            )
            self._save(f"reviews/{identifier}.json", record)
            try:
                result = self._api(
                    UPLOAD,
                    {"videoId": record["videoId"], "uploadType": "media"},
                    body=data,
                    mime=record["mime"],
                )
                if not result.get("items"):
                    raise TimeoutError()
            except YouTubeError as exc:
                # A definitive API rejection is safe to retry after a new explicit click.
                record["status"] = "approved" if exc.definitive else "uncertain"
                self._save(f"reviews/{identifier}.json", record)
                raise
            except (TimeoutError, URLError, OSError, ValueError, AttributeError):
                record["status"] = "uncertain"
                self._save(f"reviews/{identifier}.json", record)
                raise YouTubeError(
                    "Résultat incertain : YouTube n’a pas confirmé l’envoi. Vérifie dans YouTube Studio, aucun nouvel envoi automatique.",
                    504,
                ) from None
            record.update(
                status="installed",
                installedAt=time.time(),
                videoUrl=f"https://www.youtube.com/watch?v={record['videoId']}",
            )
            self._save(f"reviews/{identifier}.json", record)
            return self.review(identifier)
