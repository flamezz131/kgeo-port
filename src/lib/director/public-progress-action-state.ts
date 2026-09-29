export type PublishPublicProgressActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  publishedAt?: string;
  errors?: Record<string, string[]>;
};

export const initialPublishPublicProgressActionState: PublishPublicProgressActionState = {
  status: "idle",
};
