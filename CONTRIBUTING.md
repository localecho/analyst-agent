# Contributing

## Development Workflow

This project uses **PRD-driven development** with the Ralph loop technique.

### The Ralph Loop

Ralph is an autonomous development loop that:
1. Reads `plans/prd.json` for pending features
2. Implements the highest priority item
3. Runs verification tests
4. Marks item as `passes: true`
5. Commits and repeats

```bash
# Run Ralph loop (5 iterations)
./scripts/ralph/ralph.sh 5
```

### PRD Format

Features are tracked in `plans/prd.json`:

```json
[
  {
    "story": "Build X that does Y",
    "priority": 1,
    "passes": false,
    "verification": "npm run X outputs Y"
  }
]
```

### Adding Features

1. **Via GitHub Issue**: Use the "PRD Item" template
2. **Directly**: Add to `plans/prd.json` with `passes: false`
3. **Run Ralph**: `./scripts/ralph/ralph.sh 5`

### Manual Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# After implementing, update prd.json
# Set passes: true for completed items
```

### Commit Messages

Format: `<type>: <description>`

Types:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Adding tests

### Code Style

- Use TypeScript where possible
- Functional patterns preferred
- Keep modules small and focused
- Document public APIs

## Part of 6-Agent Team

This agent coordinates with:
- **Orchestrator**: Task routing
- **Scout**: Opportunity detection
- **Builder**: Code generation
- **Marketer**: Content creation
- **Analyst**: Portfolio monitoring
- **Archivist**: Knowledge management

See [orchestrator-agent](https://github.com/localecho/orchestrator-agent) for team overview.
