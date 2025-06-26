# Copilot Instructions for This Project

## General Guidelines
- Write clear, modular, and well-documented code.
- Follow existing naming conventions for files, variables, and functions.
- Use environment variables for configuration where appropriate.
- Add new features in the appropriate subdirectory (e.g., new resource types in `resources/`, new tools in `tools/`).

## TypeScript/Node (mcp-server)
- Use ES modules and TypeScript best practices.
- Prefer named exports over default exports.
- Use `zod` for schema validation (see `umbracoManagementAPI.zod.ts`).
- Organize helpers and utilities in the `helpers/` directory.
- Place type definitions in the `types/` directory.
- Use the `orval` tool for OpenAPI client generation (see `orval.config.ts`).
- Follow the structure for resource and tool factories as seen in `resources/` and `tools/`.
- Write tests in the `test-helpers/__tests__/` directory using Jest.

## C#/.NET (test-site)
- Use ASP.NET Core MVC conventions for controllers, views, and configuration.
- Place Razor views in the `Views/` directory.
- Store configuration in `appsettings.json` and `appsettings.Development.json`.
- Use dependency injection and configuration patterns as per .NET best practices.

## Testing
- Write and organize tests in the appropriate test directories.
- Use Jest for TypeScript/Node code and standard .NET testing tools for C# code.

## Documentation
- Update the `README.md` with any major changes or new features.
- Document new modules, helpers, and utilities clearly.

---

_This file is used by GitHub Copilot to guide code suggestions and maintain consistency across the project._
