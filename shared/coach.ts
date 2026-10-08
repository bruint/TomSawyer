export interface CoachTurn {
  id: string;
  question: string;
  answer: string;
  contextAt: string;
  createdAt: string;
}

export interface CoachConversation {
  enabled: boolean;
  turns: CoachTurn[];
}
