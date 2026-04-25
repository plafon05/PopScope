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
    llm_provider: Literal['yandex', 'stub'] = Field(default='stub', alias='LLM_PROVIDER')

    yandex_gpt_api_key: str | None = Field(default=None, alias='YANDEX_GPT_API_KEY')
    yandex_gpt_folder_id: str | None = Field(default=None, alias='YANDEX_GPT_FOLDER_ID')
    yandex_gpt_model_uri_template: str = Field(
        default='gpt://{folder_id}/yandexgpt/latest',
        alias='YANDEX_GPT_MODEL_URI_TEMPLATE',
    )
    yandex_gpt_base_url: str = Field(
        default='https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
        alias='YANDEX_GPT_BASE_URL',
    )
    yandex_gpt_temperature: float = Field(default=0.2, alias='YANDEX_GPT_TEMPERATURE')
    yandex_gpt_max_tokens: int = Field(default=1200, alias='YANDEX_GPT_MAX_TOKENS')
    yandex_gpt_timeout_seconds: float = Field(default=30.0, alias='YANDEX_GPT_TIMEOUT_SECONDS')


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
