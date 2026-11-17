# Hats Protocol — fork and dependency review

**Question:** can Hats Protocol be maintained through an independent fork, and should membership signing depend on it?

**Answer:** an independent fork is legally possible and operationally expensive. It should not be a prerequisite for signing or for foundational membership. This covenant draft does not adopt Hats or a fork. Phase 3 of the membership work can revisit a *read* of an upstream deployment. It should not start with a fork.

Reviewed repository: https://github.com/Hats-Protocol/hats-protocol

Reviewed on November 13, 2026, from the public default branch and its README and license.

## What Hats is

Hats Protocol is a role and credential system for DAOs. A hat is an ERC-1155-similar token. The wearer cannot transfer it. An admin hat can mint, and for mutable hats can transfer, the token. Eligibility and toggle modules can revoke or deactivate a hat. Hat identifiers are a tree: a top hat and up to 14 further levels. Authorities other than hat-admin are attached outside the protocol, for example by a token-gate somewhere else.

That design is a credential tree. It is not a membership contract, and it does not store a person's name, email, or signature. Those facts are why it must stay optional. The Association's membership record is the signed covenant plus the steward's acceptance, held off-chain.

## License

The repository is distributed under the GNU Affero General Public License version 3.

An independent fork is allowed. The fork must stay under AGPL-3.0, keep the license notices, and mark modifications. AGPL section 13 adds a duty the ordinary GPL does not: if a modified version lets users interact with it over a network, those users must be offered the corresponding source.

Hats is on-chain software. Operating a modified deployment is not a private copy in the ordinary GPL sense if the public calls the contracts. A fork used as a public credential system should assume the AGPL source-offer applies. This membership application is offered under GPL-3.0-only, matching `launchpad-PMA/docs`. GPL-3.0 code may be linked with AGPL-3.0 code only with care: the AGPL's own combination clause is about linking AGPL code with GPL-3.0 code and keeping the AGPL on the covered part. Vendoring Hats *into* this repository would pull AGPL duties into the membership service. That is a reason to keep any future fork in its own repository.

This review does not copy Hats source.

## Dependencies and shape

From the project documentation and layout:

- Solidity contracts, with `Hats.sol` as the core.
- ERC-1155-similar interface. The project says it is not fully ERC-1155 compliant because wearer transfers and receiver hooks are disabled.
- Admin, eligibility, and toggle addresses. Eligibility and toggle may be contracts (`IHatsEligibility`, `IHatsToggle`) or externally owned or governance accounts.
- Supporting libraries typical of this codebase's era, including OpenZeppelin-style contracts and Solady `Multicallable` (the README identifies Solady's Multicallable).
- Foundry-style development and a separate modules ecosystem (Hats Module SDK and eligibility/toggle modules live around the core and move faster than the core).

A fork has to track not only `Hats.sol` but the modules the Association actually relies on. A hat with no eligibility module does not, by itself, know who is a PMA member.

## Security

The README records two audits:

| Auditor | Report date | Commit named by the project |
| --- | --- | --- |
| Trust Security | February 23, 2023 | `60f07df` |
| Sherlock | May 3, 2023 | `fafcfd` |

Those audits are of the code at those commits. They are not an audit of a later commit, of a fork, or of modules written afterward. Anyone running a fork inherits the unaudited delta.

Structural risks that matter for this Association:

- **Admin concentration.** A top hat administers the tree. Whoever wears it can mint and, for mutable hats, move credentials. That key is a governance root, not a membership list.
- **Mutable hats.** Admins can change details, max supply (not below current supply), eligibility, toggle, and image, and can flip mutability off only one way. A member "wearing" a mutable hat does not have a fixed privilege.
- **Eligibility bugs revoke people.** `balanceOf` returns zero when the hat is inactive or the wearer is ineligible. A bad module can strip a role instantly. That must never be the only record of PMA membership.
- **Grafting.** Trees can be linked and unlinked. Deep nesting can make admin calls impractical or impossible within gas limits. The project itself warns against attaching external authority more than roughly ten nested trees deep.
- **No personal data, but public linkage.** Hat balances are public. If a member's personal wallet is the wearer, chain data links that address to a role. The membership system must not write the member's name, email, or signature on-chain to make that link, and wallet connection stays voluntary.
- **Fork drift.** An independent fork does not receive upstream fixes unless someone merges them. The 2023 audits will go stale. A maintained fork needs a named maintainer, a process for upstream security advisories, and a new audit of any change to mint, burn, eligibility, or admin paths.

## Can a fork be maintained?

Yes, under four conditions:

1. A separate AGPL-3.0 repository, with modification notices and a source offer if the contracts are deployed for public use.
2. A named maintainer and an upstream-merge practice, including the module contracts actually used.
3. A fresh audit of the delta before any hat is treated as a privilege.
4. A written rule that hat state is a convenience credential. The off-chain membership record remains the authority for who is a member.

Those conditions are not met here, and this phase does not try to meet them.

## Alternatives that do not require a fork

| Need | Approach that fits this phase |
| --- | --- |
| Who is a member | The membership database: application, signature, steward approval, membership id. |
| Who may approve applications | Steward role, checked server-side. A bearer credential for stewards. No chain role. |
| Optional paid or token benefits | Patreon, Hipcamp, and a configurable NFT `balanceOf` check against published collection addresses. |
| Later on-chain roles, without a fork | Read an upstream Hats deployment, if counsel and the Board later select a deployment and a hat id. Call `balanceOf`. Do not copy the contracts. |
| A different role system | OpenZeppelin AccessControl or AccessManager if the Association ever deploys its own audited contract. Guild or another credential layer, if reviewed, for off-chain gates. |

Reading upstream Hats later is a smaller risk than forking it. The membership signature flow does not call Hats at all.

## Decision

Do not make Hats, a hat, or a fork a condition of applying, signing, paying nothing, or receiving foundational membership. Do not vendor the contracts into this repository. Revisit an upstream read, not a fork, only in the later phase that deals with governance automation, and only after a current audit review of the exact deployment.
