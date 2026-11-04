# application-settings

Per-application settings stored in `ApplicationSetting.config`, one JSON section per feature (`ai`, `general`, `widget`).

- `ApplicationConfigStore.update` locks the settings row (`SELECT ... FOR UPDATE`) before reading and writing, so two sections saved at the same time cannot overwrite each other. The AI settings use the same store.
- `GET` and `PATCH /organizations/:organizationId/applications/:applicationId/settings` need `application.read` and `application.update`. Changes are audited as `application.settings.updated` with the changed keys only.
- `GET /service/widget-config` (API key scope `chat`) returns only what the chat widget needs: title, welcome message, colour, position and whether the AI assistant is on.

See docs/API_DESIGN.md.
