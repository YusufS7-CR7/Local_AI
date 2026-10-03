import fs from 'fs';
import path from 'path';

export interface MemoryFact {
  id: string;
  category: 'profile' | 'preference' | 'contact' | 'task' | 'general';
  key: string;
  value: string;
  source?: string;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
}

export interface MemoryEpisode {
  id: string;
  timestamp: number;
  prompt: string;
  toolsUsed: string[];
  summary: string;
}

export interface MemoryData {
  facts: MemoryFact[];
  episodes: MemoryEpisode[];
}

export class MemoryStore {
  private filePath: string;
  private data: MemoryData = { facts: [], episodes: [] };
  private isLoaded = false;

  public isReady(): boolean {
    return this.isLoaded;
  }

  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    this.filePath = path.join(dataDir, 'memory.json');
    this.init();
  }

  private init(): void {
    try {
      const dataDir = path.dirname(this.filePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          facts: Array.isArray(parsed.facts) ? parsed.facts : [],
          episodes: Array.isArray(parsed.episodes) ? parsed.episodes : [],
        };
      } else {
        this.save();
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.warn('[MemoryStore] Failed to load memory.json:', err.message);
      this.data = { facts: [], episodes: [] };
      this.isLoaded = true;
    }
  }

  private save(): void {
    try {
      const dataDir = path.dirname(this.filePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err: any) {
      console.error('[MemoryStore] Failed to save memory.json:', err.message);
    }
  }

  /**
   * Stores or updates a fact in long-term memory.
   */
  public remember(
    key: string,
    value: string,
    category: MemoryFact['category'] = 'general',
    source?: string
  ): MemoryFact {
    const cleanKey = key.trim().toLowerCase();
    const cleanValue = value.trim();

    const existingIndex = this.data.facts.findIndex(
      f => f.key.toLowerCase() === cleanKey || f.id.toLowerCase() === cleanKey
    );

    const now = Date.now();

    if (existingIndex >= 0) {
      const existing = this.data.facts[existingIndex];
      existing.value = cleanValue;
      existing.category = category;
      existing.updatedAt = now;
      if (source) existing.source = source;
      existing.accessCount += 1;
      this.save();
      console.log(`[MemoryStore] Updated fact: "${cleanKey}" -> "${cleanValue}"`);
      return existing;
    }

    const newFact: MemoryFact = {
      id: `fact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category,
      key: key.trim(),
      value: cleanValue,
      source,
      createdAt: now,
      updatedAt: now,
      accessCount: 1,
    };

    this.data.facts.push(newFact);
    this.save();
    console.log(`[MemoryStore] Remembered new fact: [${category}] "${key.trim()}" -> "${cleanValue}"`);
    return newFact;
  }

  /**
   * Recalls facts relevant to a query.
   */
  public recall(query: string, limit: number = 8): MemoryFact[] {
    if (!query || this.data.facts.length === 0) return [];

    const lowerQuery = query.toLowerCase();
    const tokens = lowerQuery.split(/\s+/).filter(t => t.length > 2);

    const scored = this.data.facts.map(fact => {
      let score = 0;
      const lowerKey = fact.key.toLowerCase();
      const lowerVal = fact.value.toLowerCase();

      // Exact phrase match
      if (lowerQuery.includes(lowerKey)) score += 10;
      if (lowerKey.includes(lowerQuery)) score += 8;
      if (lowerVal.includes(lowerQuery)) score += 6;

      // Token matches
      for (const t of tokens) {
        if (lowerKey.includes(t)) score += 3;
        if (lowerVal.includes(t)) score += 2;
        if (fact.category.toLowerCase().includes(t)) score += 1;
      }

      return { fact, score };
    });

    const matches = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => {
        s.fact.accessCount += 1;
        return s.fact;
      });

    if (matches.length > 0) {
      this.save();
    }

    return matches;
  }

  /**
   * Removes a fact by key or id.
   */
  public forget(keyOrId: string): boolean {
    const clean = keyOrId.trim().toLowerCase();
    const initialLen = this.data.facts.length;
    this.data.facts = this.data.facts.filter(
      f => f.key.toLowerCase() !== clean && f.id.toLowerCase() !== clean
    );
    const deleted = this.data.facts.length < initialLen;
    if (deleted) {
      this.save();
      console.log(`[MemoryStore] Forgot fact: "${keyOrId}"`);
    }
    return deleted;
  }

  /**
   * Returns all stored facts.
   */
  public getAllFacts(): MemoryFact[] {
    return [...this.data.facts];
  }

  /**
   * Records a completed task episode into episodic memory (kept up to last 50).
   */
  public recordEpisode(prompt: string, toolsUsed: string[], summary: string): void {
    const episode: MemoryEpisode = {
      id: `ep_${Date.now()}`,
      timestamp: Date.now(),
      prompt: prompt.trim(),
      toolsUsed,
      summary: summary.trim(),
    };

    this.data.episodes.unshift(episode);
    if (this.data.episodes.length > 50) {
      this.data.episodes = this.data.episodes.slice(0, 50);
    }
    this.save();
  }

  /**
   * Returns recent task episodes.
   */
  public getRecentEpisodes(limit: number = 5): MemoryEpisode[] {
    return this.data.episodes.slice(0, limit);
  }

  /**
   * Formats relevant memory context for inclusion in LLM Prompts (Planner and Final Response).
   */
  public formatContext(query?: string): string {
    const parts: string[] = [];

    // 1. Facts
    let relevantFacts: MemoryFact[] = [];
    if (query) {
      relevantFacts = this.recall(query, 6);
    }
    // Always include high-priority user profile and preferences
    const profileFacts = this.data.facts.filter(
      f => (f.category === 'profile' || f.category === 'preference') && !relevantFacts.some(rf => rf.id === f.id)
    ).slice(0, 5);

    const allFacts = [...relevantFacts, ...profileFacts];

    if (allFacts.length > 0) {
      parts.push('ПАМЯТЬ И ЗНАНИЯ О ПОЛЬЗОВАТЕЛЕ:');
      for (const f of allFacts) {
        parts.push(`- [${f.category}] ${f.key}: ${f.value}`);
      }
    }

    // 2. Recent Episodes
    const recent = this.getRecentEpisodes(3);
    if (recent.length > 0) {
      if (parts.length > 0) parts.push('');
      parts.push('НЕДАВНИЕ ВЫПОЛНЕННЫЕ ДЕЙСТВИЯ (ИСТОРИЯ):');
      for (const ep of recent) {
        const timeAgo = this.formatTimeAgo(ep.timestamp);
        parts.push(`- (${timeAgo}) Команда: "${ep.prompt}" -> Результат: ${ep.summary}`);
      }
    }

    return parts.join('\n');
  }

  private formatTimeAgo(timestamp: number): string {
    const sec = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
    if (sec < 60) return `${sec} сек. назад`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} мин. назад`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} ч. назад`;
    const days = Math.round(hr / 24);
    return `${days} дн. назад`;
  }
}

export const memoryStore = new MemoryStore();
