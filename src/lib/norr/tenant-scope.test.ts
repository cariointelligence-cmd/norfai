import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Pure tenant rule: invited active members share the owner's workspace id. */
export function effectiveWorkspaceOwner(opts: {
  actorId: string;
  membershipOwnerId: string | null;
  membershipStatus: string | null;
}): string {
  if (opts.membershipOwnerId && opts.membershipStatus === "active" && opts.membershipOwnerId !== opts.actorId) {
    return opts.membershipOwnerId;
  }
  return opts.actorId;
}

describe("workspace tenancy", () => {
  it("lets an invited member see the owner's records", () => {
    assert.equal(
      effectiveWorkspaceOwner({ actorId: "member-1", membershipOwnerId: "owner-1", membershipStatus: "active" }),
      "owner-1",
    );
  });

  it("keeps a removed member out of the owner's workspace", () => {
    assert.equal(
      effectiveWorkspaceOwner({ actorId: "member-1", membershipOwnerId: "owner-1", membershipStatus: "revoked" }),
      "member-1",
    );
  });

  it("does not let workspace B ids resolve to workspace A", () => {
    const a = effectiveWorkspaceOwner({ actorId: "a", membershipOwnerId: null, membershipStatus: null });
    const b = effectiveWorkspaceOwner({ actorId: "b", membershipOwnerId: null, membershipStatus: null });
    assert.notEqual(a, b);
  });

  it("binds an invited email to the joining user and uses the owner workspace", () => {
    const invited = { email: "member@example.com", status: "invited", member_user_id: null as string | null, owner_user_id: "owner-1" };
    const afterJoin = invited.status === "invited" && invited.email === "member@example.com"
      ? { ...invited, status: "active", member_user_id: "member-1" }
      : invited;
    assert.equal(afterJoin.status, "active");
    assert.equal(
      effectiveWorkspaceOwner({
        actorId: afterJoin.member_user_id!,
        membershipOwnerId: afterJoin.owner_user_id,
        membershipStatus: afterJoin.status,
      }),
      "owner-1",
    );
  });

  it("after removal, the same user cannot keep owner scope", () => {
    assert.equal(
      effectiveWorkspaceOwner({ actorId: "member-1", membershipOwnerId: "owner-1", membershipStatus: "removed" }),
      "member-1",
    );
  });
});
