# Fish shell completion for DAI Harness CLI
# Install: copy to ~/.config/fish/completions/dai.fish

complete -c dai -n '__fish_use_subcommand' -a 'tools' -d 'Tool registry management'
complete -c dai -n '__fish_use_subcommand' -a 'skills' -d 'Skill management'
complete -c dai -n '__fish_use_subcommand' -a 'config' -d 'Configuration management'
complete -c dai -n '__fish_use_subcommand' -a 'doctor' -d 'Run diagnostics'
complete -c dai -n '__fish_use_subcommand' -a 'validate' -d 'Quality gate validation'

# Global options
complete -c dai -l json -s j -d 'Force JSON output'
complete -c dai -l no-color -d 'Disable colored output'
complete -c dai -l quiet -s q -d 'Suppress stdout output'
complete -c dai -l debug -d 'Enable debug mode'
complete -c dai -l version -s V -d 'Show version'
complete -c dai -l help -s h -d 'Show help'

# tools subcommands
complete -c dai -n '__fish_seen_subcommand_from tools' -a 'list' -d 'List all tools'
complete -c dai -n '__fish_seen_subcommand_from tools' -a 'search' -d 'Search tools'
complete -c dai -n '__fish_seen_subcommand_from tools' -a 'call' -d 'Call a tool by name'

# tools list/search options
complete -c dai -n '__fish_seen_subcommand_from tools' -l category -s c -d 'Filter by category'
complete -c dai -n '__fish_seen_subcommand_from tools' -l search -s s -d 'Search query'

# tools call arguments
complete -c dai -n '__fish_seen_subcommand_from tools; and __fish_seen_subcommand_from call' -a 'skills.list' -d 'List all skills'
complete -c dai -n '__fish_seen_subcommand_from tools; and __fish_seen_subcommand_from call' -a 'skills.search' -d 'Search skills'
complete -c dai -n '__fish_seen_subcommand_from tools; and __fish_seen_subcommand_from call' -a 'validate.quality' -d 'Quality gate validation'
complete -c dai -n '__fish_seen_subcommand_from tools; and __fish_seen_subcommand_from call' -a 'config.get' -d 'Get config value'
complete -c dai -n '__fish_seen_subcommand_from tools; and __fish_seen_subcommand_from call' -a 'doctor.check' -d 'Run diagnostics'
complete -c dai -n '__fish_seen_subcommand_from tools; and __fish_seen_subcommand_from call' -a 'engineering.software' -d 'Software engineering'
complete -c dai -n '__fish_seen_subcommand_from tools; and __fish_seen_subcommand_from call' -a 'engineering.frontend' -d 'Frontend engineering'
complete -c dai -n '__fish_seen_subcommand_from tools; and __fish_seen_subcommand_from call' -a 'engineering.qa' -d 'QA engineering'
complete -c dai -n '__fish_seen_subcommand_from tools; and __fish_seen_subcommand_from call' -a 'ai.engineer' -d 'AI engineering'
complete -c dai -n '__fish_seen_subcommand_from tools; and __fish_seen_subcommand_from call' -a 'game.design' -d 'Game design'

# tools call options
complete -c dai -n '__fish_seen_subcommand_from tools; and __fish_seen_subcommand_from call' -l args -s a -d 'Tool arguments as JSON'
complete -c dai -n '__fish_seen_subcommand_from tools; and __fish_seen_subcommand_from call' -l stdin -d 'Read arguments from stdin'

# skills subcommands
complete -c dai -n '__fish_seen_subcommand_from skills' -a 'list' -d 'List all skills'
complete -c dai -n '__fish_seen_subcommand_from skills' -a 'search' -d 'Search skills'
complete -c dai -n '__fish_seen_subcommand_from skills' -a 'categories' -d 'List categories'

# config subcommands
complete -c dai -n '__fish_seen_subcommand_from config' -a 'get' -d 'Get a config value'
complete -c dai -n '__fish_seen_subcommand_from config' -a 'set' -d 'Set a config value'
complete -c dai -n '__fish_seen_subcommand_from config' -a 'list' -d 'List all config values'
complete -c dai -n '__fish_seen_subcommand_from config' -a 'init' -d 'Initialize config file'
complete -c dai -n '__fish_seen_subcommand_from config' -a 'delete' -d 'Delete a config value'

# config get/set/delete requires key argument
complete -c dai -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from get; or __fish_seen_subcommand_from config; and __fish_seen_subcommand_from delete' -a 'dai.debug' -d 'Debug mode'
complete -c dai -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from get; or __fish_seen_subcommand_from config; and __fish_seen_subcommand_from delete' -a 'dai.quiet' -d 'Quiet mode'
complete -c dai -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from get; or __fish_seen_subcommand_from config; and __fish_seen_subcommand_from delete' -a 'dai.json' -d 'JSON output'
complete -c dai -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from get; or __fish_seen_subcommand_from config; and __fish_seen_subcommand_from delete' -a 'dai.color' -d 'Color output'
complete -c dai -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from get; or __fish_seen_subcommand_from config; and __fish_seen_subcommand_from delete' -a 'dai.apiUrl' -d 'API URL'
complete -c dai -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from get; or __fish_seen_subcommand_from config; and __fish_seen_subcommand_from delete' -a 'dai.timeout' -d 'Timeout (ms)'

# doctor options
complete -c dai -n '__fish_seen_subcommand_from doctor' -l verbose -s v -d 'Verbose output'

# validate options
complete -c dai -n '__fish_seen_subcommand_from validate' -l level -s l -d 'Validation level (1-3)' -r
complete -c dai -n '__fish_seen_subcommand_from validate' -l strict -d 'Treat warnings as failures'
complete -c dai -n '__fish_seen_subcommand_from validate' -l report -d 'Write report to file' -r -F
