using System.Text;
using System.Text.Json;
using CollegeFootballData.Models;
using Microsoft.Kiota.Serialization.Json;

// Compiles against the previously published public types, then exercises the
// actual generated deserializer and serializer with Kiota's JSON implementation.
using var input = new MemoryStream(Encoding.UTF8.GetBytes("{\"competition\":\"cfp\"}"));
var node = await new JsonParseNodeFactory().GetRootParseNodeAsync("application/json", input);
var playoff = node.GetObjectValue(CfpPlayoff.CreateFromDiscriminatorValue)
    ?? throw new Exception("Missing playoff");
Cfp? competition = playoff.Competition;
if (competition != Cfp.Cfp) throw new Exception("cfp did not deserialize to Cfp.Cfp");
using var writer = new JsonSerializationWriter();
writer.WriteObjectValue(null, playoff);
using var output = writer.GetSerializedContent();
using var json = JsonDocument.Parse(output);
if (json.RootElement.GetProperty("competition").GetString() != "cfp")
    throw new Exception("Cfp.Cfp did not serialize to cfp");
// The other public enum must continue to coexist with Cfp.
PlayoffCompetition other = PlayoffCompetition.Cfp;
_ = LiveGamePlay_rushPash.Rush;
Console.WriteLine($"Cfp round trip passed; PlayoffCompetition remains available: {other}");
