export const scenarioIds: readonly string[];
export function controlledFilesystem(scenario: string): { fs: Record<string, (...args: any[]) => Promise<any>> };
export function runScenario(scenario: string, runtime: unknown, memory: ReturnType<typeof controlledFilesystem>): Promise<void>;
