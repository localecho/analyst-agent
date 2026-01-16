#!/bin/bash
# Ralph Wiggum Technique - Autonomous Development Loop
# Usage: ./ralph.sh <max_iterations> [prd_file]
#
# This script runs Claude Code in a loop until all PRD items pass
# or max iterations is reached.

set -e

MAX_ITERS=${1:-50}
PRD_FILE=${2:-"plans/prd.json"}
PROGRESS_FILE="progress.txt"
STOP_PHRASE="<promise>COMPLETE</promise>"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  Ralph Wiggum Autonomous Loop${NC}"
echo -e "${BLUE}=========================================${NC}"
echo -e "Max iterations: ${YELLOW}$MAX_ITERS${NC}"
echo -e "PRD file: ${YELLOW}$PRD_FILE${NC}"
echo ""

# Validate PRD file exists
if [ ! -f "$PRD_FILE" ]; then
  echo -e "${RED}Error: PRD file not found: $PRD_FILE${NC}"
  echo "Create a PRD file with features to implement."
  exit 1
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "# Started: $(date)" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
fi

# Count remaining tasks
count_remaining() {
  if command -v jq &> /dev/null; then
    jq '[.[] | select(.passes == false)] | length' "$PRD_FILE" 2>/dev/null || echo "?"
  else
    grep -c '"passes": false' "$PRD_FILE" 2>/dev/null || echo "0"
  fi
}

# The Main Loop
for ((i=1; i<=MAX_ITERS; i++)); do
  REMAINING=$(count_remaining)

  echo ""
  echo -e "${YELLOW}━━━ Iteration $i of $MAX_ITERS ━━━${NC}"
  echo -e "Remaining tasks: ${BLUE}$REMAINING${NC}"
  echo ""

  # Check if already complete
  if [ "$REMAINING" = "0" ]; then
    echo -e "${GREEN}All PRD items are passing!${NC}"
    break
  fi

  # Run Claude Code with the Ralph prompt
  OUTPUT=$(/opt/homebrew/bin/claude --print "
Read $PRD_FILE and $PROGRESS_FILE.

Your task:
1. Find the highest priority feature that has 'passes: false'
2. Implement ONLY that single feature
3. Run type checks (npm run build or npx tsc --noEmit) and tests (npm test) if available
4. If successful, update $PRD_FILE marking the item as 'passes: true'
5. Append your learnings/observations to $PROGRESS_FILE
6. Git commit the changes with a descriptive message

Rules:
- Focus on ONE feature per iteration
- If tests fail, fix them before committing
- If stuck after 3 attempts on same feature, mark it as blocked and move on
- Use existing code patterns from the codebase

When ALL items in the PRD have 'passes: true', output exactly:
$STOP_PHRASE
" 2>&1) || true

  # Print output
  echo "$OUTPUT"

  # Check for stop phrase
  if echo "$OUTPUT" | grep -q "$STOP_PHRASE"; then
    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  Ralph completed the backlog!${NC}"
    echo -e "${GREEN}  Finished after $i iterations${NC}"
    echo -e "${GREEN}=========================================${NC}"

    # Log completion
    echo "" >> "$PROGRESS_FILE"
    echo "# Completed: $(date)" >> "$PROGRESS_FILE"
    echo "# Total iterations: $i" >> "$PROGRESS_FILE"

    exit 0
  fi

  # Brief pause between iterations to prevent rate limiting
  sleep 2
done

echo ""
echo -e "${YELLOW}=========================================${NC}"
echo -e "${YELLOW}  Ralph reached max iterations ($MAX_ITERS)${NC}"
echo -e "${YELLOW}  Some tasks may still be incomplete${NC}"
echo -e "${YELLOW}=========================================${NC}"

# Log timeout
echo "" >> "$PROGRESS_FILE"
echo "# Stopped at max iterations: $(date)" >> "$PROGRESS_FILE"
echo "# Completed iterations: $MAX_ITERS" >> "$PROGRESS_FILE"

exit 1
