/**
 * Campaign policy wrapped around the kcc-ablation plugin's mechanics.
 *
 * The sealed-workspace and variant builders live in the plugin; what
 * stays here is this repo's rule registry lookup and the guards that
 * make ablating the wrong thing a deliberate act instead of a default.
 */
import { RULES } from "../rules.mjs";
import { makeDocVariant } from "../../../plugins/kcc-ablation/skills/ablate/scripts/seal.mjs";

export { makeSealedWorkspace } from "../../../plugins/kcc-ablation/skills/ablate/scripts/seal.mjs";

/**
 * Copy the plugin named by RULES[ruleId] and rewrite the injected doc
 * for one arm. Arm "A" keeps the rule, arm "B" ablates it; both get an
 * arm-unique sentinel so the hook payload identifies the arm without
 * asking the model anything.
 */
export async function makePluginVariant(variantDir, { pluginsDir, ruleId, arm }) {
  const rule = RULES[ruleId];
  if (!rule) throw new Error(`unknown rule id "${ruleId}"`);
  if (rule.retired) {
    throw new Error(
      `rule "${ruleId}" was retired in ${rule.retired} — it is no longer in the doc, so there is nothing to ablate`
    );
  }
  // A rule whose text a prior campaign already measured as load-bearing must
  // not be re-ablated by accident. Its verdict could only ever be weaker than
  // the measurement it contradicts, and a `no-delta` from it reads as a licence
  // to delete content that was measured to be worth 2.7 rubric points. Running
  // one has to be a deliberate act, not the default of a bare `run-probe.mjs`
  // with no --probes (which selects every registered probe).
  if (rule.measuredContent && process.env.KCC_ABLATE_MEASURED !== "1") {
    throw new Error(
      `rule "${ruleId}" ablates content the 0.10.0 campaign measured as load-bearing ` +
        `(${rule.measuredContent}). Its verdict cannot license a deletion. ` +
        `Set KCC_ABLATE_MEASURED=1 only if you know why you want this.`
    );
  }

  return makeDocVariant(variantDir, { pluginsDir, rule, ruleId, arm });
}
