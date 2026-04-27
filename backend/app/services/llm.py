from __future__ import annotations

from dataclasses import dataclass
from time import time
from typing import Protocol
from uuid import uuid4

import httpx

from app.core.config import Settings


@dataclass(slots=True)
class LLMResult:
    provider: str
    model_name: str | None
    text: str


class LLMClient(Protocol):
    async def generate(self, prompt: str) -> LLMResult:
        ...


class StubLLMClient:
    async def generate(self, prompt: str) -> LLMResult:
        text = (
            'Аналитический отчет сформирован в stub-режиме. '\
            'Подключите LLM-провайдер для расширенного текста.'
        )
        return LLMResult(provider='stub', model_name='stub-v1', text=text)


class GigaChatClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._access_token: str | None = None
        self._expires_at_ts: float = 0.0

    def _http_verify(self) -> bool | str:
        if self.settings.gigachat_ca_bundle_path:
            return self.settings.gigachat_ca_bundle_path
        return self.settings.gigachat_ssl_verify

    async def _get_access_token(self) -> str:
        if self._access_token and time() < self._expires_at_ts - 5:
            return self._access_token

        if not self.settings.gigachat_auth_key:
            raise ValueError('GigaChat credentials are missing')

        headers = {
            'Authorization': f'Basic {self.settings.gigachat_auth_key}',
            'RqUID': str(uuid4()),
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        }
        payload = {'scope': self.settings.gigachat_scope}

        async with httpx.AsyncClient(
            timeout=self.settings.gigachat_timeout_seconds,
            verify=self._http_verify(),
        ) as client:
            response = await client.post(
                self.settings.gigachat_auth_url,
                data=payload,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()

        access_token = data.get('access_token')
        expires_at = data.get('expires_at')
        if not access_token:
            raise ValueError('GigaChat token response does not contain access_token')
        if not isinstance(expires_at, (int, float)):
            raise ValueError('GigaChat token response does not contain expires_at')

        self._access_token = access_token
        self._expires_at_ts = float(expires_at)
        return access_token

    async def generate(self, prompt: str) -> LLMResult:
        access_token = await self._get_access_token()

        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
        payload = {
            'model': self.settings.gigachat_model,
            'messages': [{'role': 'user', 'content': prompt}],
            'stream': False,
            'temperature': self.settings.gigachat_temperature,
            'max_tokens': self.settings.gigachat_max_tokens,
        }

        async with httpx.AsyncClient(
            timeout=self.settings.gigachat_timeout_seconds,
            verify=self._http_verify(),
        ) as client:
            response = await client.post(
                self.settings.gigachat_base_url,
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()

        choices = data.get('choices', [])
        if not choices:
            raise ValueError('GigaChat response does not contain choices')
        message_text = choices[0].get('message', {}).get('content', '').strip()
        if not message_text:
            raise ValueError('GigaChat response message is empty')

        model_name = data.get('model') or self.settings.gigachat_model
        return LLMResult(
            provider='gigachat',
            model_name=model_name,
            text=message_text,
        )


def build_llm_client(settings: Settings) -> LLMClient:
    if not settings.report_use_llm:
        return StubLLMClient()
    if settings.llm_provider == 'gigachat':
        return GigaChatClient(settings)
    return StubLLMClient()
