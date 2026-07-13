"""LLM 调用封装（OpenAI 兼容接口）。

使用 openai SDK 的兼容模式，可对接智谱 GLM / OpenAI 等。
"""
from __future__ import annotations

from openai import OpenAI, APIError, APITimeoutError, RateLimitError

from . import config


def _get_client() -> OpenAI:
    if not config.LLM_API_KEY:
        raise LLMConfigError(
            "未配置 LLM_API_KEY，请在 backend/.env 中填写（参考 .env.example）。"
        )
    return OpenAI(
        api_key=config.LLM_API_KEY,
        base_url=config.LLM_BASE_URL,
        timeout=config.LLM_TIMEOUT,
    )


def generate_lesson(system_prompt: str, user_prompt: str) -> str:
    """调用 LLM 生成教案 Markdown 文本。

    返回模型输出的纯文本（Markdown）。
    出错时抛出 LLMError，由上层捕获并转成 HTTP 响应。
    """
    try:
        client = _get_client()
    except LLMConfigError:
        raise

    try:
        resp = client.chat.completions.create(
            model=config.LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
        )
    except APITimeoutError as e:
        raise LLMError(f"请求超时：{e}") from e
    except RateLimitError as e:
        raise LLMError(f"触发限流，请稍后重试：{e}") from e
    except APIError as e:
        raise LLMError(f"模型服务返回错误：{e}") from e

    content = resp.choices[0].message.content or ""
    return content.strip()


class LLMError(Exception):
    """LLM 调用过程中的可向用户展示的错误。"""


class LLMConfigError(LLMError):
    """LLM 配置缺失错误。"""
