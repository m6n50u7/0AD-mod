function MeatSupplies() {}

MeatSupplies.prototype.Schema =
	"<a:help>Deals with supplies and upkeep.</a:help>" +
	"<a:example>" +
		"<Max>100</Max>" +
		"<DecayRate>1</DecayRate>" +
		"<ConsumeRate>6</ConsumeRate>" +
		"<StarveEffect>6</StarveEffect>" +
	"</a:example>" +
	"<element name='Max' a:help='Maximum supplies'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='DecayRate' a:help='supplies drained in 10 seconds'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='ConsumeRate' a:help='consumption Rate when gathering the supplies per 10 seconds'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='StarveEffect' a:help='Health drop per 10 seconds when entity is out of supplies'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>";

MeatSupplies.prototype.Init = function()
{
	// Cache this value so it allows techs to maintain previous supplies level
	this.maxMeatSupplies = this.template.Max;
	this.supplies = this.maxMeatSupplies;
	this.decayRate = ApplyValueModificationsToEntity("MeatSupplies/DecayRate", +this.template.DecayRate, this.entity);
	this.consumeRate = ApplyValueModificationsToEntity("MeatSupplies/ConsumeRate", +this.template.ConsumeRate, this.entity);
	this.starveEffect = ApplyValueModificationsToEntity("MeatSupplies/StarveEffect", +this.template.StarveEffect, this.entity);
	this.CheckDecayTimer();
	this.CheckConsumeTimer();
	this.CheckStarveTimer();
	this.CheckHungerTimer();
};

/**
 * Returns the current Supply value.
 * This is 0 if (and only if) the unit is starving.
 */
MeatSupplies.prototype.GetMeatSupplies = function()
{
	return this.supplies;
};

MeatSupplies.prototype.GetMaxMeatSupplies = function()
{
	return this.maxMeatSupplies;
};

/**
 * @return {boolean} Whether the units are injured. Dead units are not considered injured.
 */
MeatSupplies.prototype.IsHungry = function()
{
	return this.GetMeatSupplies() < this.GetMaxMeatSupplies();
};

MeatSupplies.prototype.SetMeatSupplies = function(value)
{
	// Before changing the value, activate Fogging if necessary to hide changes
	let cmpFogging = Engine.QueryInterface(this.entity, IID_Fogging);
	if (cmpFogging)
		cmpFogging.Activate();

	this.supplies = Math.max(0, Math.min(this.GetMaxMeatSupplies(), value));
	//this.RegisterMeatSuppliesChanged(old);
};

MeatSupplies.prototype.GetConsumeRate = function()
{
	return this.consumeRate;
};

MeatSupplies.prototype.GetDecayRate = function()
{
	return this.decayRate;
};

MeatSupplies.prototype.ExecuteDecay = function()
{
	if(this.GetMeatSupplies() != 0)
		this.Reduce(1);
};
MeatSupplies.prototype.LookForMeat = function ()
{
	if (this.GetMeatSupplies() < Math.random() * this.GetMaxMeatSupplies() * 0.5)
	{
		let filter = (ent, type, template) => {
			let cmpRes = Engine.QueryInterface(ent, IID_ResourceSupply);
			if (type.generic == "meat" && cmpRes.GetCurrentAmount())
				return true;};
		let cmpUnitAI = Engine.QueryInterface(this.entity, IID_UnitAI);
		let cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
		let pos = cmpPosition.GetPosition();
		let cmpVision = Engine.QueryInterface(this.entity, IID_Vision);
		let posi = Vector2D.from3D(pos);
		let rang = cmpVision.GetRange();
		let meares = cmpUnitAI.FindNearbyResource(posi, filter, rang);
		if (meares)
		{
			cmpUnitAI.PerformGather(meares, false, true, true, false, false);//(target, queued, force, pushFront, redrop, full)
		}
	}
}
MeatSupplies.prototype.ExecuteConsumption = function()
{
	if (this.IsHungry())
	{
		let carry = 0;
		let cmpResourceGatherer = Engine.QueryInterface(this.entity, IID_ResourceGatherer);
		let car = cmpResourceGatherer.GetCarryingStatus();
		if (car)
		{
			for(let carried of car)
			{
				if (carried.type == "meat")
				{
					carry = carried.amount;
				}
			}
		}
		if (cmpResourceGatherer && carry)
		{
			let res = [];
			let elm = {};
			elm.type = "meat";
			elm.amount = carry - 1;
			res.push(elm)
			cmpResourceGatherer.GiveResources(res);
			this.Increase(1);
			//the Omnivors should be able to survive on meat only diets
			let cmpVeganSupplies = Engine.QueryInterface(this.entity, IID_VeganSupplies);
			if(cmpVeganSupplies)
				cmpVeganSupplies.Increase(0.75);
			//the food generally contains water
			let cmpWaterSupplies = Engine.QueryInterface(this.entity, IID_WaterSupplies);
			if(cmpWaterSupplies)
				cmpWaterSupplies.Increase(0.75);
		}
	}
};
/*
 * Check if the any timer needs to be started or stopped
 */
MeatSupplies.prototype.CheckDecayTimer = function()
{
	if (this.decayTimer)
		return;

	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	let timer = Math.round(100000 / this.decayRate);
	this.decayTimer = cmpTimer.SetInterval(this.entity, IID_MeatSupplies, "ExecuteDecay", timer, timer, null);
};
MeatSupplies.prototype.CheckHungerTimer = function()
{
	if (this.hungerTimer)
		return;

	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	this.hungerTimer = cmpTimer.SetInterval(this.entity, IID_MeatSupplies, "LookForMeat", 1000, 1000, null);
};
MeatSupplies.prototype.CheckStarveTimer = function()
{
	if (this.starveTimer)
		return;
	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	let timer = Math.round(10000 / this.starveEffect);
	this.starveTimer = cmpTimer.SetInterval(this.entity, IID_MeatSupplies, "HandleStarve", timer, timer, null);
};
MeatSupplies.prototype.CheckConsumeTimer = function()
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
	let timer = Math.round(10000 / this.consumeRate);
	this.consumeTimer = cmpTimer.SetInterval(this.entity, IID_MeatSupplies, "ExecuteConsumption", timer, timer, null);
};

MeatSupplies.prototype.Reduce = function(amount)
{
	if (!amount || !this.supplies)
		return { "suppliesChange": 0 };
	// Before changing the value, activate Fogging if necessary to hide changes
	let cmpFogging = Engine.QueryInterface(this.entity, IID_Fogging);
	if (cmpFogging)
		cmpFogging.Activate();

	let oldMeatSupplies = this.supplies;
	// If we reached 0, then starve.
	if (amount >= this.supplies)
	{
		this.supplies = 0;
		//this.RegisterMeatSuppliesChanged(oldMeatSupplies);
		return { "suppliesChange": -oldMeatSupplies };
	}

	this.supplies -= amount;
	//this.RegisterMeatSuppliesChanged(oldHitpoints);
	return { "suppliesChange": this.supplies - oldMeatSupplies };
};

/**
 * Handle what happens when the entity starves.
 */
MeatSupplies.prototype.HandleStarve = function()
{
	if (this.GetMeatSupplies() == 0)
	{
		let cmpHealth = Engine.QueryInterface(this.entity, IID_Health);
		if (cmpHealth)
			cmpHealth.Reduce(Math.round(Math.random() * 2));
	}
};

MeatSupplies.prototype.Increase = function(amount)
{
	// Before changing the value, activate Fogging if necessary to hide changes
	let cmpFogging = Engine.QueryInterface(this.entity, IID_Fogging);
	if (cmpFogging)
		cmpFogging.Activate();

	if (!this.IsHungry())
		return { "old": this.supplies, "new": this.supplies };

	let old = this.supplies;
	this.supplies = Math.min(this.supplies + amount, this.GetMaxMeatSupplies());

	//this.RegisterMeatSuppliesChanged(old);

	return { "old": old, "new": this.supplies };
};
/**
MeatSupplies.prototype.RecalculateValues = function()
{
	let oldMaxMeatSupplies = this.GetMaxMeatSupplies();
	let newMaxMeatSupplies = ApplyValueModificationsToEntity("MeatSupplies/Max", +this.template.Max, this.entity);
	if (oldMaxMeatSupplies != newMaxMeatSupplies)
	{
		let newMeatSupplies = this.supplies * newMaxMeatSupplies/oldMaxMeatSupplies;
		this.maxMeatSupplies = newMaxMeatSupplies;
		this.SetMeatSupplies(newMeatSupplies);
	}

	let oldDecayRate = this.decayRate;
	this.decayRate = ApplyValueModificationsToEntity("MeatSupplies/decayRate", +this.template.DecayRate, this.entity);

	let oldConsumeRate = this.consumeRate;
	this.consumeRate = ApplyValueModificationsToEntity("MeatSupplies/ConsumeRate", +this.template.ConsumeRate, this.entity);

	if (this.decayRate != oldDecayRate || this.consumeRate != oldConsumeRate)
		this.CheckDecayTimer();
};

MeatSupplies.prototype.OnValueModification = function(msg)
{
	if (msg.component == "MeatSupplies")
		this.RecalculateValues();
};

MeatSupplies.prototype.OnOwnershipChanged = function(msg)
{
	if (msg.to != INVALID_PLAYER)
		this.RecalculateValues();
};

MeatSupplies.prototype.RegisterMeatSuppliesChanged = function(from)
{
	this.CheckDecayTimer();
	Engine.PostMessage(this.entity, MT_MeatSuppliesChanged, { "from": from, "to": this.supplies });
};
**/
function MeatSuppliesMirage() {}
MeatSuppliesMirage.prototype.Init = function(cmpMeatSupplies)
{
	this.maxMeatSupplies = cmpMeatSupplies.GetMaxMeatSupplies();
	this.supplies = cmpMeatSupplies.GetMeatSupplies();
	this.hungry = cmpMeatSupplies.IsHungry();
};
MeatSuppliesMirage.prototype.GetMaxMeatSupplies = function() { return this.maxMeatSupplies; };
MeatSuppliesMirage.prototype.GetMeatSupplies = function() { return this.supplies; };
MeatSuppliesMirage.prototype.IsHungry = function() { return this.hungry; };

Engine.RegisterGlobal("MeatSuppliesMirage", MeatSuppliesMirage);

MeatSupplies.prototype.Mirage = function()
{
	let mirage = new MeatSuppliesMirage();
	mirage.Init(this);
	return mirage;
};

Engine.RegisterComponentType(IID_MeatSupplies, "MeatSupplies", MeatSupplies);
