using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using VenEl.DynamicAgents.Core.Engine;
using VenEl.DynamicAgents.Core.Interfaces;
using VenEl.DynamicAgents.Core.Loggers;
using VenEl.DynamicAgents.Core.Providers;
using VenEl.DynamicAgents.Infrastructure.Clients;
using VenEl.DynamicAgents.Infrastructure.Factories;
using Microsoft.AspNetCore.Http;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddOpenApi();
builder.Services.AddSingleton<IAgentLogger, ConsoleAgentLogger>();
builder.Services.AddSingleton<HttpClient>();

builder.Services.AddSingleton<ILlmClientFactory>(sp => 
{
    var httpClient = sp.GetRequiredService<HttpClient>();
    var factory = new LlmClientFactory();
    factory.RegisterProvider("mock", new MockLlmClient());
    
    var apiKey = builder.Configuration["ApiKeys:Gemini"] ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY");
    if (!string.IsNullOrEmpty(apiKey))
    {
        factory.RegisterProvider("google", new GeminiLlmClient(httpClient, apiKey));
    }

    var puterKey = builder.Configuration["ApiKeys:Puter"] ?? Environment.GetEnvironmentVariable("PUTER_API_KEY");
    if (!string.IsNullOrEmpty(puterKey))
    {
        factory.RegisterProvider("puter", new OpenAiCompatibleClient(httpClient, puterKey, "https://api.puter.com/puterai/openai/v1"));
    }
    
    return factory;
});

builder.Services.AddSingleton<IAgentFactory>(sp => 
{
    var factory = new DefaultAgentFactory();
    // Register the standard console agent for backend tasks
    factory.RegisterAgentType("Standard", (cfg, client, logger, tools) => new VenEl.DynamicAgents.Core.Agents.ConfiguredAgent(cfg, client, logger, tools));
    // Register the generative UI agent for frontend tasks
    factory.RegisterAgentType("GenerativeUI", (cfg, client, logger, tools) => new VenEl.DynamicAgents.GenerativeUI.GenerativeUIAgent(cfg, client, logger, tools));
    return factory;
});

var baseDir = AppDomain.CurrentDomain.BaseDirectory;
if (!File.Exists(Path.Combine(baseDir, "workflows.yaml"))) {
    File.WriteAllText(Path.Combine(baseDir, "workflows.yaml"), "workflows: []");
}

builder.Services.AddSingleton<VenEl.DynamicAgents.Core.Interfaces.IConfigurationProvider>(new LocalFileConfigurationProvider(
    Path.Combine(baseDir, "agents.yaml"), 
    Path.Combine(baseDir, "workflows.yaml")));

builder.Services.AddSingleton<IToolRegistry>(sp => new DefaultToolRegistry(new System.Collections.Generic.List<ITool>()));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapPost("/api/upload-document", async (DocumentRequest req, VenEl.DynamicAgents.Core.Interfaces.IConfigurationProvider configProvider, IAgentFactory agentFactory, ILlmClientFactory llmFactory, IAgentLogger logger, IToolRegistry toolRegistry) =>
{
    try
    {
        var agents = await configProvider.LoadAgentsAsync();
        
        // 1. Parse the document using document_parsing_agent
        var parserConfig = agents.First(a => a.Id == "document_parsing_agent");
        var llmClient = llmFactory.GetClient(parserConfig);
        var parser = agentFactory.CreateAgent(parserConfig, llmClient, logger, toolRegistry.GetTools(parserConfig.Tools));
        
        var parsedJson = await parser.ExecuteAsync(req.DocumentText);

        // 2. Generate the UI form using ui_form_generator_agent
        var uiConfig = agents.First(a => a.Id == "ui_form_generator_agent");
        var uiLlmClient = llmFactory.GetClient(uiConfig);
        var uiGenerator = agentFactory.CreateAgent(uiConfig, uiLlmClient, logger, toolRegistry.GetTools(uiConfig.Tools));
        
        var htmlForm = await uiGenerator.ExecuteAsync(parsedJson);

        return Results.Ok(new { Html = htmlForm, Data = parsedJson });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { Error = ex.Message });
    }
})
.WithName("UploadDocument");

app.MapPost("/api/check-eligibility", async (EligibilityRequest req, VenEl.DynamicAgents.Core.Interfaces.IConfigurationProvider configProvider, IAgentFactory agentFactory, ILlmClientFactory llmFactory, IAgentLogger logger, IToolRegistry toolRegistry) =>
{
    try
    {
        var agents = await configProvider.LoadAgentsAsync();
        var inputData = JsonSerializer.Serialize(req.FormData);
        
        // 1. Score credit using credit_scoring_agent
        var scorerConfig = agents.First(a => a.Id == "credit_scoring_agent");
        var llmClient = llmFactory.GetClient(scorerConfig);
        var scorer = agentFactory.CreateAgent(scorerConfig, llmClient, logger, toolRegistry.GetTools(scorerConfig.Tools));
        
        var scoreJson = await scorer.ExecuteAsync(inputData);

        // 2. Generate the dashboard using ui_dashboard_generator_agent
        var uiConfig = agents.First(a => a.Id == "ui_dashboard_generator_agent");
        var uiLlmClient = llmFactory.GetClient(uiConfig);
        var uiGenerator = agentFactory.CreateAgent(uiConfig, uiLlmClient, logger, toolRegistry.GetTools(uiConfig.Tools));
        
        var htmlDashboard = await uiGenerator.ExecuteAsync(scoreJson);

        return Results.Ok(new { Html = htmlDashboard, Data = scoreJson });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { Error = ex.Message });
    }
})
.WithName("CheckEligibility");

app.Run();

public record DocumentRequest(string DocumentText);
public record EligibilityRequest(object FormData);
