export type StoragePolicyContract = {
  name: string;
  command: "ALL" | "INSERT" | "SELECT" | "UPDATE" | "DELETE";
  permissive: boolean;
  roles: readonly string[];
  usingExpression: string | null;
  checkExpression: string | null;
};

function canonicalPolicy(policy: StoragePolicyContract): string {
  return JSON.stringify({
    name: policy.name,
    command: policy.command,
    permissive: policy.permissive,
    roles: [...policy.roles].sort(),
    usingExpression: policy.usingExpression,
    checkExpression: policy.checkExpression,
  });
}

export function storagePolicyInventoryMatches(
  actual: readonly StoragePolicyContract[],
  approved: readonly StoragePolicyContract[],
): boolean {
  if (actual.length !== approved.length) return false;
  const actualByName = new Map(actual.map((policy) => [policy.name, policy]));
  if (actualByName.size !== actual.length) return false;
  return approved.every((expected) => {
    const policy = actualByName.get(expected.name);
    return policy !== undefined && canonicalPolicy(policy) === canonicalPolicy(expected);
  });
}
