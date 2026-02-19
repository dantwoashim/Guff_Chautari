import { GeminiProvider } from './gemini/geminiProvider';
import type { ModelProvider } from './types';

export class ProviderRegistry {
  private readonly providers = new Map<string, ModelProvider>();

  constructor(initialProviders: ModelProvider[] = []) {
    for (const provider of initialProviders) {
      this.providers.set(provider.id, provider);
    }
  }

  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  resolve(providerId: string): ModelProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    return provider;
  }

  list(): string[] {
    return [...this.providers.keys()];
  }
}

export const defaultProviderRegistry = new ProviderRegistry([new GeminiProvider()]);
