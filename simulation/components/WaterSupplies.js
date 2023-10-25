function WaterSupplies() {}

WaterSupplies.prototype.Schema =
	"<a:help>Deals with supplies and upkeep.</a:help>" +
	"<a:example>" +
		"<Max>100</Max>" +
		"<DecayRate>1</DecayRate>" +
		"<ConsumeRate>6</ConsumeRate>" +
		"<ThirstEffect>6</ThirstEffect>" +
	"</a:example>" +
	"<element name='Max' a:help='Maximum supplies'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='DecayRate' a:help='supplies drained in one minute'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='ConsumeRate' a:help='consumption Rate when gathering the supplies per minute'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='ThirstEffect' a:help='Health drop per 10 seconds when entity is out of supplies'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>";

WaterSupplies.prototype.Init = function()
{
	// Cache this value so it allows techs to maintain previous supplies level
	this.maxWaterSupplies = this.template.Max;
	this.supplies = this.maxWaterSupplies;
	this.decayRate = ApplyValueModificationsToEntity("WaterSupplies/DecayRate", +this.template.DecayRate, this.entity);
	this.consumeRate = ApplyValueModificationsToEntity("WaterSupplies/ConsumeRate", +this.template.ConsumeRate, this.entity);
	this.thirstEffect = ApplyValueModificationsToEntity("WaterSupplies/ThirstEffect", +this.template.ThirstEffect, this.entity);
	this.CheckDecayTimer();
	this.CheckConsumeTimer();
	this.CheckThirstTimer();
	this.CheckDrinkTimer();
};

/**
 * Returns the current Supply value.
 * This is 0 if (and only if) the unit is starving.
 */
WaterSupplies.prototype.GetWaterSupplies = function()
{
	return this.supplies;
};

WaterSupplies.prototype.GetMaxWaterSupplies = function()
{
	return this.maxWaterSupplies;
};

/**
 * @return {boolean} Whether the units are injured. Dead units are not considered injured.
 */
WaterSupplies.prototype.IsThursty = function()
{
	return this.GetWaterSupplies() < this.GetMaxWaterSupplies();
};

WaterSupplies.prototype.SetWaterSupplies = function(value)
{
	// Before changing the value, activate Fogging if necessary to hide changes
	let cmpFogging = Engine.QueryInterface(this.entity, IID_Fogging);
	if (cmpFogging)
		cmpFogging.Activate();

	this.supplies = Math.max(0, Math.min(this.GetMaxWaterSupplies(), value));
	//this.RegisterWaterSuppliesChanged(old);
};

WaterSupplies.prototype.GetConsumeRate = function()
{
	return this.consumeRate;
};

WaterSupplies.prototype.GetDecayRate = function()
{
	return this.decayRate;
};

WaterSupplies.prototype.ExecuteDecay = function()
{
	if(this.GetWaterSupplies() != 0)
		this.Reduce(1);
};
WaterSupplies.prototype.LookForWater = function ()
{
	if (this.GetWaterSupplies() < this.GetMaxWaterSupplies() * 0.1)
	{
		let filter = (ent, type, template) => {
			let cmpRes = Engine.QueryInterface(ent, IID_ResourceSupply);
			if (type.generic == "water" && cmpRes.GetCurrentAmount())
				return true;};
		let cmpUnitAI = Engine.QueryInterface(this.entity, IID_UnitAI);
		let cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
		let pos = cmpPosition.GetPosition();
		let cmpVision = Engine.QueryInterface(this.entity, IID_Vision);
		let posi = Vector2D.from3D(pos);
		let rang = cmpVision.GetRange();
		let watres = cmpUnitAI.FindNearbyResource(posi, filter, rang);
		if (watres)
		{
			cmpUnitAI.PerformGather(watres, false, true, true, false, false);//(target, queued, force, pushFront = false, redrop = true, full = true)
		}
	}
}

WaterSupplies.prototype.ExecuteConsumption = function()
{
	if (this.IsThursty())
	{
		let carry = 0;
		let cmpResourceGatherer = Engine.QueryInterface(this.entity, IID_ResourceGatherer);
		let car = cmpResourceGatherer.GetCarryingStatus();
		if (car)
		{
			for(let carried of car)
			{
				if (carried.type == "water")
				{
					carry = carried.amount;
				}
			}
		}
		if (cmpResourceGatherer && carry)
		{
			let res = [];
			let elm = {};
			elm.type = "water";
			elm.amount = carry - 1;
			res.push(elm)
			cmpResourceGatherer.GiveResources(res);
			this.Increase(1);
		}
	}
};
/*
 * Check if the any timer needs to be started or stopped
 */
WaterSupplies.prototype.CheckDecayTimer = function()
{
	if (this.decayTimer)
		return;

	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	let timer = Math.round(100000 / this.decayRate);
	this.regenTimer = cmpTimer.SetInterval(this.entity, IID_WaterSupplies, "ExecuteDecay", timer, timer, null);
};
WaterSupplies.prototype.CheckDrinkTimer = function()
{
	if (this.drinkTimer)
		return;

	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	this.drinkTimer = cmpTimer.SetInterval(this.entity, IID_WaterSupplies, "LookForWater", 1000, 1000, null);
};
WaterSupplies.prototype.CheckThirstTimer = function()
{
	if (this.thirstTimer)
		return;
	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	let timer = Math.round(60000 / this.thirstEffect);
	this.thirstTimer = cmpTimer.SetInterval(this.entity, IID_WaterSupplies, "HandleThirst", timer, timer, null);
};
WaterSupplies.prototype.CheckConsumeTimer = function()
{
	// check if we need a timer
	if (!this.GetConsumeRate())
	{
		// we don't need a timer, disable if one exists
		if (this.consumeTimer)
		{
			let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
			cmpTimer.CancelTimer(this.consumeTimer);
			this.consumeTimer = undefined;
		}
		return;
	}

	// we need a timer, enable if one doesn't exist
	if (this.consumeTimer)
		return;

	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	let timer = Math.round(60000 / this.consumeRate);
	this.regenTimer = cmpTimer.SetInterval(this.entity, IID_WaterSupplies, "ExecuteConsumption", timer, timer, null);
};

WaterSupplies.prototype.Reduce = function(amount)
{
	if (!amount || !this.supplies)
		return { "suppliesChange": 0 };
	// Before changing the value, activate Fogging if necessary to hide changes
	let cmpFogging = Engine.QueryInterface(this.entity, IID_Fogging);
	if (cmpFogging)
		cmpFogging.Activate();

	let oldWaterSupplies = this.supplies;
	// If we reached 0, then starve.
	if (amount >= this.supplies)
	{
		this.supplies = 0;
		//this.RegisterWaterSuppliesChanged(oldWaterSupplies);
		return { "suppliesChange": -oldWaterSupplies };
	}

	this.supplies -= amount;
	//this.RegisterWaterSuppliesChanged(oldHitpoints);
	return { "suppliesChange": this.supplies - oldWaterSupplies };
};

/**
 * Handle what happens when the entity starves.
 */
WaterSupplies.prototype.HandleThirst = function()
{
	if (this.GetWaterSupplies() == 0)
	{
		let cmpHealth = Engine.QueryInterface(this.entity, IID_Health);
		if (cmpHealth)
			cmpHealth.Reduce(Math.round(Math.random() * 2));
	}
};

WaterSupplies.prototype.Increase = function(amount)
{
	// Before changing the value, activate Fogging if necessary to hide changes
	let cmpFogging = Engine.QueryInterface(this.entity, IID_Fogging);
	if (cmpFogging)
		cmpFogging.Activate();

	if (!this.IsThursty())
		return { "old": this.supplies, "new": this.supplies };

	let old = this.supplies;
	this.supplies = Math.min(this.supplies + amount, this.GetMaxWaterSupplies());

	//this.RegisterWaterSuppliesChanged(old);

	return { "old": old, "new": this.supplies };
};
/**
WaterSupplies.prototype.RecalculateValues = function()
{
	let oldMaxWaterSupplies = this.GetMaxWaterSupplies();
	let newMaxWaterSupplies = ApplyValueModificationsToEntity("WaterSupplies/Max", +this.template.Max, this.entity);
	if (oldMaxWaterSupplies != newMaxWaterSupplies)
	{
		let newWaterSupplies = this.supplies * newMaxWaterSupplies/oldMaxWaterSupplies;
		this.maxWaterSupplies = newMaxWaterSupplies;
		this.SetWaterSupplies(newWaterSupplies);
	}

	let oldDecayRate = this.decayRate;
	this.decayRate = ApplyValueModificationsToEntity("WaterSupplies/decayRate", +this.template.DecayRate, this.entity);

	let oldConsumeRate = this.consumeRate;
	this.consumeRate = ApplyValueModificationsToEntity("WaterSupplies/ConsumeRate", +this.template.ConsumeRate, this.entity);

	if (this.decayRate != oldDecayRate || this.consumeRate != oldConsumeRate)
		this.CheckDecayTimer();
};

WaterSupplies.prototype.OnValueModification = function(msg)
{
	if (msg.component == "WaterSupplies")
		this.RecalculateValues();
};

WaterSupplies.prototype.OnOwnershipChanged = function(msg)
{
	if (msg.to != INVALID_PLAYER)
		this.RecalculateValues();
};

WaterSupplies.prototype.RegisterWaterSuppliesChanged = function(from)
{
	this.CheckDecayTimer();
	Engine.PostMessage(this.entity, MT_WaterSuppliesChanged, { "from": from, "to": this.supplies });
};
**/
function WaterSuppliesMirage() {}
WaterSuppliesMirage.prototype.Init = function(cmpWaterSupplies)
{
	this.maxWaterSupplies = cmpWaterSupplies.GetMaxWaterSupplies();
	this.supplies = cmpWaterSupplies.GetWaterSupplies();
	this.thursty = cmpWaterSupplies.IsThursty();
};
WaterSuppliesMirage.prototype.GetMaxWaterSupplies = function() { return this.maxWaterSupplies; };
WaterSuppliesMirage.prototype.GetWaterSupplies = function() { return this.supplies; };
WaterSuppliesMirage.prototype.IsThursty = function() { return this.thursty; };

Engine.RegisterGlobal("WaterSuppliesMirage", WaterSuppliesMirage);

WaterSupplies.prototype.Mirage = function()
{
	let mirage = new WaterSuppliesMirage();
	mirage.Init(this);
	return mirage;
};

Engine.RegisterComponentType(IID_WaterSupplies, "WaterSupplies", WaterSupplies);
