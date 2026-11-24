# @accelerate/tooling-patches

Plan and apply hash-guarded replacements of existing UTF-8 project files. Preview with planReplacement and verifyPlan; applyReplacements requires explicit apply: true.

The cooperative lock coordinates Accelerate writers only. External writers must remain idle. Rollback is compensating, not crash-atomic. Creation, deletion and rename are not supported. Never apply untrusted plans without independently authorizing their content.

Build and distribution verification are pending.
