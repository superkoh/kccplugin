/**
 * The arm builder lives in the kcc-ablation plugin (the reusable home of
 * the ablation mechanics, unit-tested under plugins/kcc-ablation/tests);
 * this module re-exports it so campaign code keeps one import root.
 */
export {
  buildVariant,
  stripFrontmatter,
} from "../../../plugins/kcc-ablation/skills/ablate/scripts/ablate.mjs";
