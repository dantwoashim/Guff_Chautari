
import { GoogleGenAI } from "@google/genai";
import { supabase } from "../lib/supabase";
import {
  ConversationBranch,
  ConversationTree,
  Message,
  BranchComparison
} from "../types";
import { v4 as uuidv4 } from 'uuid';
import { modelManager } from "./modelManager";

// Safe lazy initialization
const getAiClient = () => {
  const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';
  return new GoogleGenAI({ apiKey: apiKey || '' });
};

/**
 * BranchingEngine handles the "Parallel Universe" feature, allowing conversations 
 * to split into multiple independent timelines and later merge or compare them.
 */
export const branchingService = {

  async createBranch(
    sessionId: string,
    parentBranchId: string | null,
    forkPoint: number,
    label: string = "New Timeline"
  ): Promise<ConversationBranch> {

    const { count } = await supabase
      .from('conversation_branches')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    let actualParentId = parentBranchId;

    if (count === 0) {
      const { data: chatData } = await supabase
        .from('chats')
        .select('messages')
        .eq('id', sessionId)
        .limit(1)
        .maybeSingle();

      const rootMessages = chatData?.messages || [];
      const rootBranchId = uuidv4();

      const rootBranch: ConversationBranch = {
        id: rootBranchId,
        forkPoint: 0,
        messages: rootMessages,
        label: "Main Timeline",
        createdAt: Date.now()
      };

      await supabase.from('conversation_branches').insert({
        id: rootBranch.id,
        session_id: sessionId,
        fork_point: 0,
        label: rootBranch.label,
        messages: rootBranch.messages,
        created_at: new Date().toISOString()
      });

      actualParentId = rootBranchId;
    }

    let parentMessages: Message[] = [];
    if (actualParentId) {
      const { data } = await supabase
        .from('conversation_branches')
        .select('messages')
        .eq('id', actualParentId)
        .limit(1)
        .maybeSingle();
      parentMessages = data?.messages || [];
    }

    const forkedHistory = parentMessages.slice(0, forkPoint + 1);

    const newBranch: ConversationBranch = {
      id: uuidv4(),
      parentId: actualParentId || undefined,
      forkPoint: forkPoint,
      messages: forkedHistory,
      label: label,
      createdAt: Date.now()
    };

    const { error } = await supabase.from('conversation_branches').insert({
      id: newBranch.id,
      session_id: sessionId,
      parent_branch_id: newBranch.parentId,
      fork_point: newBranch.forkPoint,
      label: newBranch.label,
      messages: newBranch.messages,
      created_at: new Date(newBranch.createdAt).toISOString()
    });

    if (error) throw error;
    return newBranch;
  },

  async deleteBranch(branchId: string): Promise<void> {
    const { error } = await supabase
      .from('conversation_branches')
      .delete()
      .eq('id', branchId);
    if (error) throw error;
  },

  async renameBranch(branchId: string, newLabel: string): Promise<void> {
    const { error } = await supabase
      .from('conversation_branches')
      .update({ label: newLabel })
      .eq('id', branchId);
    if (error) throw error;
  },

  async getBranchTree(sessionId: string): Promise<ConversationTree> {
    const { data, error } = await supabase
      .from('conversation_branches')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const branches: Record<string, ConversationBranch> = {};
    if (data) {
      data.forEach(row => {
        branches[row.id] = {
          id: row.id,
          parentId: row.parent_branch_id,
          forkPoint: row.fork_point,
          messages: row.messages,
          label: row.label,
          createdAt: new Date(row.created_at).getTime()
        };
      });
    }

    const activeBranchId = data && data.length > 0 ? data[data.length - 1].id : sessionId;

    return {
      rootId: sessionId,
      branches: branches,
      activeBranchId: activeBranchId
    };
  },

  async compareBranches(branchAId: string, branchBId: string): Promise<BranchComparison> {
    const ai = getAiClient();
    const { data: bA } = await supabase.from('conversation_branches').select('*').eq('id', branchAId).limit(1).maybeSingle();
    const { data: bB } = await supabase.from('conversation_branches').select('*').eq('id', branchBId).limit(1).maybeSingle();

    if (!bA || !bB) throw new Error("Branch not found");

    const branchAMessages = bA.messages.map((m: Message) => `${m.role}: ${m.text}`).join('\n');
    const branchBMessages = bB.messages.map((m: Message) => `${m.role}: ${m.text}`).join('\n');
    const divergenceMessage = bA.messages[bA.fork_point]?.text || "Unknown";

    const prompt = `
Compare these two conversation branches and create a synthesis:

Branch A (labeled: "${bA.label}"):
${branchAMessages}

Branch B (labeled: "${bB.label}"):
${branchBMessages}

Divergence Point: "${divergenceMessage}"

Analyze:
1. Key differences in approach/outcome
2. Unique insights from each branch
3. Contradictions (if any)
4. Complementary information

Create a merged summary that captures the best of both branches.

Return JSON:
{
  "divergenceAnalysis": "string",
  "keyDifferences": ["string"],
  "branchAStrengths": ["string"],
  "branchBStrengths": ["string"],
  "contradictions": ["string"],
  "mergedInsights": "string",
  "recommendedPath": "A" | "B" | "merged"
}
    `;

    return modelManager.runWithFallback('complex', async (model) => {
      const response = await ai.models.generateContent({
        model: model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 10 }
        }
      });

      const analysis = JSON.parse(response.text || "{}");

      return {
        branchA: branchAId,
        branchB: branchBId,
        divergencePoint: bA.fork_point,
        keyDifferences: analysis.keyDifferences || [],
        mergedInsights: analysis.mergedInsights || "",
        ...analysis
      } as BranchComparison & any;
    });
  },

  async mergeBranches(branchAId: string, branchBId: string): Promise<BranchComparison> {
    const comparison = await this.compareBranches(branchAId, branchBId);
    return comparison;
  }
};
