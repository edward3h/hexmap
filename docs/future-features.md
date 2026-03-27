# Future Features: Rules Implementation

This document describes campaign mechanics from the original "Battle for Gratus LXIX" rules
(see `10e Map Campaign rules final v1.pdf`) that are not yet implemented. The current app is
a GM visualisation and manual record-keeping tool; these features would automate the rules engine.

---

## Feature 1: Campaign Rounds & Phase Structure

The campaign runs over 6 weeks. Each week is a **Campaign Round** with two phases:

- **Operations Phase** (Monday–Saturday): players play games and earn resources
- **Strategic Phase** (Sunday): teams submit secret plans, which are resolved simultaneously

### What to build

- Add a `rounds` table to the DB: round number, week start/end dates, phase (operations | strategic | complete)
- Track which round is currently active on the campaign
- Surface the current phase in the UI so players know whether it's time to play games or submit plans

---

## Feature 2: Game Result Submission

Players need to submit game results so the system can award the correct resources.

### Rules

- Winning a **Warhammer 40,000 Crusade game** awards the winning team one **Military Action**
- Winning a **Kill Team SpecOps game** awards the winning team one **SpecOps Card** (determined by mission played)

### What to build

- `game_results` table: `campaign_id`, `round_id`, `game_type` (crusade | kill_team), `winner_team_id`, `loser_team_id`, `mission_played`, `submitted_by`, `submitted_at`
- API endpoint: `POST /api/campaigns/{id}/rounds/{roundId}/game-results`
- Player-facing form to submit a result (opponent must confirm, or GM approves)
- On submission, automatically credit the winning team with the appropriate resource (Military Action or SpecOps Card)
- Military Actions are consumed in the same round they're earned; SpecOps Cards persist across rounds

---

## Feature 3: SpecOps Cards

SpecOps Cards are earned from Kill Team victories and held in a team's hand until played.
Only one of each card type may be played per campaign week.

### Card definitions

| Card                          | Mission(s) that award it               | When played                                    | Effect                                                                                                                                       |
| ----------------------------- | -------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **SABOTAGE**                  | Master the Terminals                   | Before Strategic Phase                         | Destroy a Power Station / Command Bastion / Shield Generator / Manufactorum, OR disable a Spaceport for one round                            |
| **RECOVERED STC**             | Loot and Salvage, Master the Terminals | Strategic Phase (building step)                | Construct a Power Station / Command Bastion / Shield Generator / Manufactorum in a friendly non-isolated hex (replaces existing building)    |
| **SUPERIOR LOGISTICS**        | Loot and Salvage, Seize Ground         | Strategic Phase                                | One friendly non-isolated hex gains an extra Offensive Action origin this round                                                              |
| **ACQUIRE ARTIFACT**          | Secure Archeotech                      | Strategic Phase                                | Claim a Crusade Relic for a team member (steals it if another team holds it; cancels if multiple teams target the same Relic simultaneously) |
| **VITAL INTEL**               | Duel of Wits, Domination               | Strategic Phase                                | Score 1 SVP immediately for the team                                                                                                         |
| **FEINT ATTACK** _(Reaction)_ | Consecration, Escalating Hostilities   | After secret plans revealed, before resolution | Change the target hex of one friendly Offensive Action (cannot change origin)                                                                |
| **STOLEN PLANS** _(Reaction)_ | Awaken the Data-Spirits, Seize Ground  | After secret plans revealed, before resolution | Add one free Defensive Action to a chosen friendly non-isolated hex                                                                          |

### What to build

- `specops_cards` table: `id`, `campaign_id`, `round_id`, `team_id`, `card_type` (enum), `earned_at`, `played_at` (nullable), `played_round_id` (nullable)
- Enforce: one of each card type playable per round per team
- Reaction cards (FEINT ATTACK, STOLEN PLANS) are submitted in a second secret plan after initial plans are revealed
- SABOTAGE is executed before other Strategic Phase actions; all other non-reaction cards execute simultaneously in the reveal step

---

## Feature 4: Military Actions (Offensive & Defensive)

Military Actions replace the current free-form attack arrows. They are earned (one per Crusade victory)
and spent during the Strategic Phase.

### Rules

- Each Military Action can be either an **Offensive Action** or a **Defensive Action**
- **Offensive Action**: choose an origin hex (friendly, non-isolated) and an adjacent target hex
  - Exception: a Spaceport hex can target _any_ hex on the map
  - Exception: a Command Bastion hex can be the origin of _two_ Offensive Actions
- **Defensive Action**: choose a friendly hex to defend

### Secret Plans

- Grand Marshals submit their plans privately to the Arbitrator (GM)
- Plans are revealed simultaneously
- Reaction cards are then submitted and resolved simultaneously

### Resolution sequence (per Strategic Phase)

1. SABOTAGE cards executed (buildings destroyed/disabled)
2. RECOVERED STC, SUPERIOR LOGISTICS, ACQUIRE ARTIFACT, VITAL INTEL cards executed; building abilities used; Military Actions declared
3. Secret plans placed on map (revealed publicly)
4. Reaction cards submitted (FEINT ATTACK, STOLEN PLANS)
5. Final results calculated and applied

### Attack resolution rules

- If **Attack Score** (number of offensive actions targeting a hex) > **Defensive Score** (number of defensive actions in that hex + any free defensive actions from Shield Generators), the attacking team captures the hex.
- If a hex being attacked is itself the **origin** of an Offensive Action, that Offensive Action converts to a Defensive Action instead.
- Offensive Actions from hexes that are _not_ themselves under attack take precedence over those that are.
- If two teams both attack the same hex and tie on Attack Score, no one captures it.

### What to build

- `military_actions` table: `id`, `campaign_id`, `round_id`, `team_id`, `action_type` (offensive | defensive), `origin_tile_id` (nullable for defensive), `target_tile_id`, `is_reaction_modified` (bool), `submitted_at`
- `round_resolution` table or logic to record outcomes: which tiles changed hands, which attacks were converted to defences
- Grand Marshal submission UI: a form during the Strategic Phase to declare actions (hidden from other teams until reveal)
- Resolution engine: implement the precedence rules above
- Replace current free-form attack arrows with round-scoped military actions; retain the visual arrow display but drive it from the new data

---

## Feature 5: Building Active Abilities & Power System

Buildings currently only contribute SVP. Each building has an active game effect that requires **power**.

### Power rules

- A building is **powered** if it is in the same hex as a Power Station, or adjacent to a hex containing a Power Station.
- **HQ** provides its own Power Station effect (self-powered, also powers adjacent hexes).
- **Hive City** is self-powered and powers adjacent hexes.
- **Spaceport** is self-powered (provides its own Power Station effect).
- Unpowered buildings still occupy the hex but provide no ability (they still count for SVP if not isolated).

### Building abilities

| Building             | Active ability                                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HQ**               | Provides Power Station + Shield Generator benefits. Cannot be destroyed or disabled.                                                                                        |
| **Power Station**    | Powers buildings in adjacent hexes.                                                                                                                                         |
| **Command Bastion**  | (Powered) This hex can be the origin of 2 Offensive Actions instead of 1.                                                                                                   |
| **Shield Generator** | (Powered) This hex gains 1 free Defensive Action each Strategic Phase.                                                                                                      |
| **Manufactorum**     | (Powered) Each Strategic Phase, may construct one new building in a friendly hex connected by contiguous friendly hexes. Cannot build in the turn it is itself constructed. |
| **Spaceport**        | This hex can originate an Offensive Action targeting _any_ hex (not just adjacent). Cannot be built. Disabled (not destroyed) by SABOTAGE for one round.                    |
| **Hive City**        | Provides Command Bastion + Shield Generator + Power Station + Manufactorum benefits. Cannot be built, disabled, or destroyed. See two-stage capture below.                  |

### What to build

- Add a `powered` computed field to tiles, derived from adjacency to Power Stations (run at resolution time or cached)
- Enforce Command Bastion's 2-action-origin rule when validating military action submissions
- Enforce Spaceport's any-target rule
- Auto-add Shield Generator free defensive actions during resolution
- Allow Manufactorum build action as part of secret plan submission
- Track disabled state on Spaceports (disabled for one round via SABOTAGE)

---

## Feature 6: Isolated Territory

A hex is **isolated** if it is not connected to the controlling team's HQ by a contiguous chain of friendly hexes.

### Effects of isolation

- Isolated hexes are **not worth SVP** at campaign end
- Cannot be the origin of Offensive Actions
- Cannot be the target of RECOVERED STC or SUPERIOR LOGISTICS cards
- FEINT ATTACK and STOLEN PLANS cannot affect isolated territory
- Buildings in isolated territory still provide their abilities if powered (but are cut off from the Manufactorum build chain)

### What to build

- Add a `is_isolated` computed field to tiles, calculated per-team using a flood-fill/BFS from the team's HQ tile
- Recalculate after each Strategic Phase resolution (ownership changes can isolate or reconnect territory)
- Show isolated hexes visually (e.g. dimmed colour, distinct border) on the map
- Exclude isolated tiles from SVP calculation in the scores display
- Enforce isolation rules when validating military action and SpecOps card submissions

---

## Feature 7: Hive City Two-Stage Capture

Hive Cities require two successful Offensive Actions to fully capture.

### Rules

- A Hive City hex has two states: **Outskirts** and **Spire**
- The team that controls the Spire gains the Hive City's building abilities
- If an enemy captures the hex, they take the Outskirts; the Hive City is now considered **isolated** (the Spire owner loses benefits)
- To take the Spire, the attacker must control the Outskirts and make a successful Offensive Action against the hex in a subsequent round

### What to build

- Add `hive_city_state` column to tiles: `null` (no hive city), `spire_owner` (team_id of spire holder), `outskirts_owner` (team_id of outskirts holder)
- Two-step capture logic in the resolution engine
- Visual distinction between Outskirts and Spire control on the map

---

## Feature 8: Crusade Relics

Crusade Relics are archeotech items tracked at the player level (not team level) and contribute SVP.

### Rules

- Three tiers: **Artificer** (1 SVP), **Antiquity** (2 SVP), **Legendary** (3 SVP)
- Each specific Relic is unique; only one of each exists in the campaign
- Obtained via ACQUIRE ARTIFACT SpecOps Card or as Crusade mission victory bonus (GM-awarded)
- Can be stolen by another team using ACQUIRE ARTIFACT; if two teams target the same Relic simultaneously, it does not change hands

### Relationship to current "team assets"

The existing `team_assets` system is a rough stand-in. A proper implementation should:

- Track Relics at the **player** level (attached to a specific player's Crusade roster), not team level
- Have a defined list of available Relics with their tier and current holder
- Support the steal/protect resolution mechanic

### What to build

- `crusade_relics` table: `id`, `campaign_id`, `relic_name`, `tier` (artificer | antiquity | legendary), `holder_user_id` (nullable), `holder_team_id` (nullable)
- API for GM to seed the relic list at campaign start
- Resolution logic for ACQUIRE ARTIFACT card (simultaneous claim cancellation)
- Include relics in SVP calculation (replacing or supplementing the team_assets system)

---

## Feature 9: Grand Marshall Designation

Each team must nominate a Grand Marshall who has executive decision-making authority.

### What to build

- Add `is_grand_marshall` boolean to the `user_roles` table (or a separate `grand_marshalls` table) scoped to `(campaign_id, team_id)`
- Only Grand Marshalls (and GMs/superusers) can submit Strategic Phase secret plans
- Surface the Grand Marshall in team listings in the UI

---

## Implementation Order (suggested)

If implementing these incrementally, the suggested order is:

1. **Campaign Rounds & Phase Structure** — everything else depends on knowing the current phase
2. **Game Result Submission** — needed to earn Military Actions and SpecOps Cards
3. **Military Actions** (basic: earn, declare, resolve) — replaces current free-form attacks
4. **Building Active Abilities & Power System** — adds strategic depth to the map
5. **Isolated Territory** — requires ownership graph; build after power system
6. **SpecOps Cards** — adds the Kill Team layer; some cards depend on buildings/isolation
7. **Hive City Two-Stage Capture** — targeted edge case on top of the resolution engine
8. **Crusade Relics** — replaces/extends team assets
9. **Grand Marshall Designation** — small auth change, can be done at any point
