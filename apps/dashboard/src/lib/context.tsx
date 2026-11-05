"use client";

import type { Application, OrganizationWithRole } from "@platform/sdk";
import { createContext, useContext } from "react";

export interface OrganizationContextValue {
	organization: OrganizationWithRole;
	organizations: OrganizationWithRole[];
}

export interface ApplicationContextValue {
	application: Application;
	reload(): Promise<void>;
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null);
export const ApplicationContext = createContext<ApplicationContextValue | null>(null);

export function useOrganization(): OrganizationContextValue {
	const value = useContext(OrganizationContext);
	if (!value) throw new Error("useOrganization must be used inside an organization route");
	return value;
}

export function useApplication(): ApplicationContextValue {
	const value = useContext(ApplicationContext);
	if (!value) throw new Error("useApplication must be used inside an application route");
	return value;
}
