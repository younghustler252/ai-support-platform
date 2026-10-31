import { authConfig } from "../../../config/auth.js";
import type { IAuthRepository } from "../repositories/auth.repository.interface.js";

export class AuthMaintenanceService {
	constructor(private readonly deps: { authRepository: IAuthRepository }) {}

	purge(): Promise<{ sessions: number; tokens: number }> {
		return this.deps.authRepository.purgeExpired(new Date(Date.now() - authConfig.retentionMs));
	}
}
