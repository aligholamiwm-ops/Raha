import hashlib
import hmac
import secrets


def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with a random salt."""
    salt = secrets.token_hex(16)
    hash_bytes = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
    )
    return f"{salt}${hash_bytes.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored hash (constant-time comparison)."""
    try:
        salt, hash_hex = stored_hash.split("$", 1)
        expected = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
        ).hex()
        return hmac.compare_digest(expected, hash_hex)
    except Exception:
        return False
