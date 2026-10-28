export const platformDefaults = {
    branding: {
        displayName: "SupportAI", 
        tagline: "Intelligent customer support" }, 
        localization: { defaultLanguage: "en", supportedLanguages: ["en"], 
        timezone: "Africa/Lagos" }, 
        features: { aiChat: true, humanSupport: false, agentCopilot: false, widget: false 
    } 
} as const;
