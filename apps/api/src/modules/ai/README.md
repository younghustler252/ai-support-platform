# ai

Provider-agnostic AI replies. `IAiProvider` has an OpenAI-compatible adapter (configure `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`); without a key every AI turn hands over to a human.

`POST /service/conversations/:id/ai-reply` (API key scope `chat`) answers the latest customer message from published knowledge. It hands over to a human when AI is disabled, the daily cap is reached, nothing relevant is found, the provider fails, or the model answers with the handoff token. Per-application settings live in `ApplicationSetting.config.ai`.
