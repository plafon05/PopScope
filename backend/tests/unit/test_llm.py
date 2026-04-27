from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.core.config import Settings
from app.services.llm import GigaChatClient, StubLLMClient


@pytest.mark.asyncio
async def test_stub_llm_generate() -> None:
    client = StubLLMClient()
    result = await client.generate('prompt')

    assert result.provider == 'stub'
    assert 'stub' in result.model_name
    assert 'stub-режиме' in result.text


@pytest.mark.asyncio
async def test_gigachat_llm_generate_parses_response() -> None:
    settings = Settings(
        LLM_PROVIDER='gigachat',
        GIGACHAT_AUTH_KEY='base64-auth-key',
        GIGACHAT_MODEL='GigaChat-2-Lite',
    )
    client = GigaChatClient(settings)

    token_response = Mock()
    token_response.json.return_value = {
        'access_token': 'token',
        'expires_at': 4_000_000_000,
    }
    token_response.raise_for_status = Mock()

    completion_response = Mock()
    completion_response.json.return_value = {
        'model': 'GigaChat-2-Lite',
        'choices': [
            {'message': {'content': 'Готовый отчет GigaChat'}},
        ],
    }
    completion_response.raise_for_status = Mock()

    with patch('httpx.AsyncClient.post', new=AsyncMock(side_effect=[token_response, completion_response])):
        result = await client.generate('prompt')

    assert result.provider == 'gigachat'
    assert result.model_name == 'GigaChat-2-Lite'
    assert result.text == 'Готовый отчет GigaChat'


@pytest.mark.asyncio
async def test_gigachat_llm_generate_raises_without_credentials() -> None:
    settings = Settings(LLM_PROVIDER='gigachat', GIGACHAT_AUTH_KEY='')
    client = GigaChatClient(settings)

    with pytest.raises(ValueError, match='credentials'):
        await client.generate('prompt')
