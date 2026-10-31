import * as argon2 from "argon2";

const hashOptions = {
	type: argon2.argon2id,
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1,
};

export class PasswordService {
	private dummyHash: Promise<string> | undefined;

	async hash(password: string): Promise<string> {
		return argon2.hash(password, hashOptions);
	}

	async verify(hash: string, password: string): Promise<boolean> {
		try {
			return await argon2.verify(hash, password);
		} catch {
			return false;
		}
	}

	needsRehash(hash: string): boolean {
		try {
			return argon2.needsRehash(hash, hashOptions);
		} catch {
			return false;
		}
	}

	async burn(password: string): Promise<void> {
		this.dummyHash ??= this.hash("timing-equalisation-placeholder");
		await this.verify(await this.dummyHash, password);
	}
}
