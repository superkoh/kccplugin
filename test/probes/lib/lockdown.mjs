/**
 * The deny-by-default tool lists live in the kcc-ablation plugin (one
 * module, after per-probe copies drifted twice); this re-export keeps
 * the probe modules' import path stable.
 */
export {
  NO_DELEGATION,
  FULL_LOCKDOWN,
} from "../../../plugins/kcc-ablation/skills/ablate/scripts/lockdown.mjs";
