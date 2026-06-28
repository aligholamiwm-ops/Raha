import json
from unittest.mock import MagicMock, patch, ANY

import pytest

from app.websockets.celery_bridge import publish_event_from_task


@pytest.fixture
def mock_redis():
    with patch("app.websockets.celery_bridge.redis.Redis.from_url") as mock_from_url:
        mock_r = MagicMock()
        mock_from_url.return_value = mock_r
        yield mock_r


def test_creates_redis_connection_and_closes(mock_redis):
    publish_event_from_task("12345", "config_updated", {"email": "test@example.com"})

    from app.websockets.celery_bridge import redis

    redis.Redis.from_url.assert_called_once()
    mock_redis.close.assert_called_once()


def test_event_includes_timestamp(mock_redis):
    publish_event_from_task("12345", "config_updated", {"email": "test@example.com"})

    call_args = mock_redis.lpush.call_args_list
    serialized = call_args[0][0][1]
    event = json.loads(serialized)
    assert "timestamp" in event
    assert event["type"] == "config_updated"
    assert event["data"]["email"] == "test@example.com"


def test_pushes_to_user_buffer(mock_redis):
    publish_event_from_task("12345", "config_updated", {"email": "test@example.com"})

    mock_redis.lpush.assert_any_call("ws:buffer:12345", ANY)
    mock_redis.ltrim.assert_any_call("ws:buffer:12345", 0, 49)


def test_pushes_to_admin_buffer(mock_redis):
    publish_event_from_task("12345", "config_updated", {"email": "test@example.com"})

    mock_redis.lpush.assert_any_call("ws:buffer:__admin__", ANY)
    mock_redis.ltrim.assert_any_call("ws:buffer:__admin__", 0, 49)


def test_publishes_to_user_pubsub(mock_redis):
    publish_event_from_task("12345", "config_updated", {"email": "test@example.com"})

    mock_redis.publish.assert_any_call("ws:events:12345", ANY)


def test_publishes_to_admin_pubsub(mock_redis):
    publish_event_from_task("12345", "config_updated", {"email": "test@example.com"})

    mock_redis.publish.assert_any_call("ws:events:__admin__", ANY)


def test_event_fields_are_correct(mock_redis):
    publish_event_from_task("12345", "config_updated", {"email": "test@example.com"})

    serialized = mock_redis.lpush.call_args[0][1]
    event = json.loads(serialized)
    assert event["type"] == "config_updated"
    assert event["data"]["email"] == "test@example.com"


def test_buffers_limited_to_50(mock_redis):
    publish_event_from_task("12345", "config_updated", {"email": "test@example.com"})

    mock_redis.ltrim.assert_any_call("ws:buffer:12345", 0, 49)
    mock_redis.ltrim.assert_any_call("ws:buffer:__admin__", 0, 49)


def test_close_called_in_finally_on_error(mock_redis):
    mock_redis.lpush.side_effect = Exception("Redis error")

    with patch("app.websockets.celery_bridge.logger"):
        with pytest.raises(Exception, match="Redis error"):
            publish_event_from_task("12345", "config_updated", {"email": "test@example.com"})

    mock_redis.close.assert_called_once()


def test_serializes_complex_data(mock_redis):
    data = {"email": "test@example.com", "usage_up": 1024, "usage_down": 2048}
    publish_event_from_task("12345", "config_updated", data)

    serialized = mock_redis.lpush.call_args[0][1]
    event = json.loads(serialized)
    assert event["data"]["usage_up"] == 1024
    assert event["data"]["usage_down"] == 2048
