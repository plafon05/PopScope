from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )

    app_name: str = Field(default='PopScope Backend', alias='APP_NAME')
    app_env: Literal['dev', 'test', 'prod'] = Field(default='dev', alias='APP_ENV')
    debug: bool = Field(default=False, alias='APP_DEBUG')
    api_prefix: str = Field(default='/api/v1', alias='API_PREFIX')
    allowed_origins: list[str] = Field(
        default_factory=lambda: ['http://localhost:5173'],
        alias='ALLOWED_ORIGINS',
    )

    database_url: str = Field(
        default='postgresql+asyncpg://<db_user>:<db_password>@db:5432/<db_name>',
        alias='DATABASE_URL',
    )

    report_use_llm: bool = Field(default=True, alias='REPORT_USE_LLM')
    llm_provider: Literal['gigachat', 'stub'] = Field(default='stub', alias='LLM_PROVIDER')

    gigachat_auth_key: str | None = Field(default=None, alias='GIGACHAT_AUTH_KEY')
    gigachat_scope: Literal['GIGACHAT_API_PERS', 'GIGACHAT_API_B2B', 'GIGACHAT_API_CORP'] = Field(
        default='GIGACHAT_API_PERS',
        alias='GIGACHAT_SCOPE',
    )
    gigachat_auth_url: str = Field(
        default='https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
        alias='GIGACHAT_AUTH_URL',
    )
    gigachat_base_url: str = Field(
        default='https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
        alias='GIGACHAT_BASE_URL',
    )
    gigachat_model: str = Field(default='GigaChat-2', alias='GIGACHAT_MODEL')
    gigachat_temperature: float = Field(default=0.2, alias='GIGACHAT_TEMPERATURE')
    gigachat_max_tokens: int = Field(default=1200, alias='GIGACHAT_MAX_TOKENS')
    gigachat_timeout_seconds: float = Field(default=30.0, alias='GIGACHAT_TIMEOUT_SECONDS')
    gigachat_ssl_verify: bool = Field(default=True, alias='GIGACHAT_SSL_VERIFY')
    gigachat_ca_bundle_path: str | None = Field(default=None, alias='GIGACHAT_CA_BUNDLE_PATH')


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
