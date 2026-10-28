import type { Request, Response } from "express";
import type { PublicSettingsService } from "../services/public-settings.service.js";
export class PublicSettingsController { constructor(private readonly deps: { publicSettingsService: PublicSettingsService }) {} get = (_req: Request, res: Response) => { res.json({ data: this.deps.publicSettingsService.getPublicSettings() }); }; }
