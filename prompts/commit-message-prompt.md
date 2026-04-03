Generate a conventional commit message from this git diff. Output ONLY the commit message in this format:

<type>(<scope>): <short summary>

<Detailed multi-line body explaining the change. Wrap lines at ~72 characters. LIMITS: subject max 100 chars; body max 360 chars. Include why the change was made and any important notes. Separate subject and body by a single blank line. Do not include any extraneous commentary or markers. Use imperative mood.

Example:
refactor(ai): migrate providers to SDKs

Replaces direct API/CLI calls for Copilot and Gemini with SDK integrations.
This simplifies code, improves maintainability, and adds dynamic model
fetching. Updates .gitignore for geeto binaries.
