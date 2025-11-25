#!/usr/bin/env bun
import { ConfigLoader } from './src/config/loader';

const config = (await ConfigLoader.load()).config;
const apiConfig = config.api;

console.log("\n=== API Token Debug ===");
console.log("Config token:", apiConfig?.authToken);
console.log("API_TOKEN env:", process.env.API_TOKEN);
console.log("Result token:", process.env.API_TOKEN || apiConfig?.authToken);
