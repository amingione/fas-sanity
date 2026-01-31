# Functions Log Drain SDK - package.json

Description: NPM package configuration file for the Functions Log Drain SDK. Defines package metadata, dependencies, scripts, and build configuration for the @fas-motorsports/function-log-drain package.
Category: technical
Version: v1.0
Tags: sdk, npm, package, configuration, typescript, functions, logging

---


Package Configuration

This package.json file configures the Functions Log Drain SDK as an NPM package with TypeScript support, build scripts, and necessary dependencies.

{
  "name": "@fas-motorsports/function-log-drain",
  "version": "1.0.0",
  "description": "SDK for draining Sanity Function logs to external monitoring services",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "lint": "eslint src --ext .ts",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@sanity/client": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  },
  "keywords": [
    "sanity",
    "functions",
    "logging",
    "monitoring",
    "log-drain",
    "observability"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/fas-motorsports/function-log-drain.git"
  },
  "files": [
    "dist"
  ],
  "engines": {
    "node": ">=18.0.0"
  }
}

Key Configuration Details

Package Identity

Scoped package under @fas-motorsports organization

Version 1.0.0 following semantic versioning

MIT license for open-source distribution

Entry Points

Main: dist/index.js (compiled JavaScript)

Types: dist/index.d.ts (TypeScript definitions)

Scripts

build: Compiles TypeScript to JavaScript

test: Runs Jest test suite

lint: Checks code quality with ESLint

prepublishOnly: Ensures build runs before publishing

Dependencies

The package requires @sanity/client for interacting with Sanity APIs. Development dependencies include TypeScript compiler and Node.js type definitions for type-safe development.