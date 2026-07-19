FROM mcr.microsoft.com/dotnet/runtime-deps:8.0-jammy
WORKDIR /app
COPY publish/ .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["./VenEl.FASTLoans.Web"]
