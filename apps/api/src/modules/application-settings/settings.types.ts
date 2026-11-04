export type WidgetPosition = "left" | "right";

export interface WidgetSettings {
	title: string | null;
	welcomeMessage: string | null;
	primaryColor: string;
	position: WidgetPosition;
}

export interface ApplicationSettings {
	timezone: string;
	widget: WidgetSettings;
}

export interface ApplicationSettingsPatch {
	timezone?: string;
	widget?: Partial<WidgetSettings>;
}

export interface PublicWidgetConfig {
	title: string;
	welcomeMessage: string | null;
	primaryColor: string;
	position: WidgetPosition;
	aiEnabled: boolean;
}
