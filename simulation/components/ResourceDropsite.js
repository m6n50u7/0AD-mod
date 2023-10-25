function ResourceDropsite() {}

ResourceDropsite.prototype.Schema =
	"<element name='Types'>" +
		"<list>" +
			"<zeroOrMore>" +
				Resources.BuildChoicesSchema() +
			"</zeroOrMore>" +
		"</list>" +
	"</element>" +
	"<element name='Sharable' a:help='Allows allies to use this entity.'>" +
		"<data type='boolean'/>" +
	"</element>";

ResourceDropsite.prototype.Init = function()
{
	this.sharable = this.template.Sharable == "true";
	this.shared = this.sharable;
};

/**
 * Returns the list of resource types accepted by this dropsite,
 * as defined by it being referred to in the template and the resource being enabled.
 */
ResourceDropsite.prototype.GetTypes = function()
{
	let types = ApplyValueModificationsToEntity("ResourceDropsite/Types", this.template.Types, this.entity);
	return types.split(/\s+/);
};

/**
 * Returns whether this dropsite accepts the given generic type of resource.
 */
ResourceDropsite.prototype.AcceptsType = function(type)
{
	let cmpResourceSupply = Engine.QueryInterface(this.entity, IID_ResourceSupply);
	if (!cmpResourceSupply)
		return false;
	let Max = cmpResourceSupply.GetMaxAmount();
	let cur = cmpResourceSupply.GetCurrentAmount();

	return this.GetTypes().indexOf(type) != -1;
};

/**
 * @param {Object} resources - The resources to drop here in the form of { "resource": amount }.
 * @param {number} entity - The entity that tries to drop their resources here.
 *
 * @return {Object} - Which resources could be dropped off here.
 */
ResourceDropsite.prototype.ReceiveResources = function(resources, entity)
{
	let cmpResourceSupply = Engine.QueryInterface(this.entity, IID_ResourceSupply);
	if (!cmpResourceSupply)
		return {};
	let taken = {};
	let take = 0;
	for (let type in resources)
	{
		if (this.AcceptsType(type))
		{
			taken[type] = resources[type];
			take = resources[type];
			break;
		}
	}
	cmpResourceSupply.Change(take);
	return taken;
};

ResourceDropsite.prototype.IsSharable = function()
{
	return this.sharable;
};

ResourceDropsite.prototype.IsShared = function()
{
	return this.shared;
};

ResourceDropsite.prototype.SetSharing = function(value)
{
	if (!this.sharable)
		return;
	this.shared = value;
	Engine.PostMessage(this.entity, MT_DropsiteSharingChanged, { "shared": this.shared });
};

Engine.RegisterComponentType(IID_ResourceDropsite, "ResourceDropsite", ResourceDropsite);
