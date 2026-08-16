import type { IntakeSnapshot } from "./domain.js";
import type { IntakeStore } from "./ports.js";

export class DurableIntakeStore implements IntakeStore {
  constructor(private readonly storage: DurableObjectStorage, private readonly ownerId: string) {}

  async get(id: string): Promise<IntakeSnapshot | undefined> {
    const value = await this.storage.get<IntakeSnapshot>(this.key(id));
    return value ? structuredClone(value) : undefined;
  }

  async put(intake: IntakeSnapshot): Promise<void> {
    if (intake.ownerId !== this.ownerId) throw new Error("Intake owner does not match this state partition.");
    await this.storage.put(this.key(intake.id), structuredClone(intake));
  }

  async list(): Promise<IntakeSnapshot[]> {
    const values = await this.storage.list<IntakeSnapshot>({ prefix: this.key("") });
    return [...values.values()].map((value) => structuredClone(value)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  private key(id: string): string {
    return `intake:${this.ownerId}:${id}`;
  }
}

