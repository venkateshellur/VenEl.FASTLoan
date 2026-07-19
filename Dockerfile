FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# Copy csproj and restore as distinct layers
COPY ["VenEl.FASTLoans.Web.csproj", "./"]
RUN dotnet restore "./VenEl.FASTLoans.Web.csproj"

# Copy everything else and build
COPY . .
RUN dotnet publish "VenEl.FASTLoans.Web.csproj" -c Release -o /app/out

# Build runtime image
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/out .

# Hugging Face Spaces exposes port 7860 by default
ENV ASPNETCORE_URLS=http://+:7860
EXPOSE 7860

ENTRYPOINT ["dotnet", "VenEl.FASTLoans.Web.dll"]
