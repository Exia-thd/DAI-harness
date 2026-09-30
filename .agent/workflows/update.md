---
description: Check for and install DAI Harness updates
---

# Update DAI Harness

## Steps

// turbo-all

1. Check the current local version:
```bash
cat dai-harness/VERSION
```

2. Fetch the latest remote version:
```bash
git -C dai-harness fetch origin main
```

3. Check if there are new commits:
```bash
git -C dai-harness log HEAD..origin/main --oneline
```

4. If new commits exist, update the submodule:
```bash
git submodule update --remote dai-harness
```

5. Check the new version:
```bash
cat dai-harness/VERSION
```

6. Stage and commit the update:
```bash
git add dai-harness
git commit -m "chore: update DAI Harness to $(cat dai-harness/VERSION)"
```

## Notes
- If step 3 shows no output, you're already on the latest version.
- If step 3 shows commits, steps 4-6 will apply the update.
- Run this workflow periodically to stay up to date with new skills and improvements.
