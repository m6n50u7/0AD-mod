function VeganSupplies() {}

VeganSupplies.prototype.Schema =
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

VeganSupplies.prototype.Init = function()
{
	// Cache this value so it allows techs to maintain previous supplies level
	this.maxVeganSupplies = this.template.Max;
	this.supplies = this.maxVeganSupplies;
	this.decayRate = ApplyValueModificationsToEntity("VeganSupplies/DecayRate", +this.template.DecayRate, this.entity);
	this.consumeRate = ApplyValueModificationsToEntity("VeganSupplies/ConsumeRate", +this.template.ConsumeRate, this.entity);
	this.starveEffect = ApplyValueModificationsToEntity("VeganSupplies/StarveEffect", +this.template.StarveEffect, this.entity);
	this.CheckDecayTimer();
	this.CheckConsumeTimer();
	this.CheckStarveTimer();
	this.CheckHungerTimer();
};

/**
 * Returns the current Supply value.
 * This is 0 if (and only if) the unit is starving.
 */
VeganSupplies.prototype.GetVeganSupplies = function()
{
	return this.supplies;
};

VeganSupplies.prototype.GetMaxVeganSupplies = function()
{
	return this.maxVeganSupplies;
};

/**
 * @return {boolean} Whether the units are injured. Dead units are not considered injured.
 */
VeganSupplies.prototype.IsHungry = function()
{
	return this.GetVeganSupplies() < this.GetMaxVeganSupplies();
};

VeganSupplies.prototype.SetVeganSupplies = function(value)
{
	// Before changing the value, activate Fogging if necessary to hide changes
	let cmpFogging = Engine.QueryInterface(this.entity, IID_Fogging);
	if (cmpFogging)
		cmpFogging.Activate();

	this.supplies = Math.max(0, Math.min(this.GetMaxVeganSupplies(), value));
	//this.RegisterVeganSuppliesChanged(old);
};

VeganSupplies.prototype.GetConsumeRate = function()
{
	return this.consumeRate;
};

VeganSupplies.prototype.GetDecayRate = function()
{
	return this.decayRate;
};

VeganSupplies.prototype.ExecuteDecay = function()
{
	if(this.GetVeganSupplies() != 0)
		this.Reduce(1);
};

VeganSupplies.prototype.LookForVegan = function ()
{
	if (this.GetVeganSupplies() < Math.random() * this.GetMaxVeganSupplies() * 0.5)
	{
		let filter = (ent, type, template) => {
			let cmpRes = Engine.QueryInterface(ent, IID_ResourceSupply);
			if (type.generic == "vegan" && cmpRes.GetCurrentAmount())
				return true;};
		let cmpUnitAI = Engine.QueryInterface(this.entity, IID_UnitAI);
		let cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
		let pos = cmpPosition.GetPosition();
		let cmpVision = Engine.QueryInterface(this.entity, IID_Vision);
		let posi = Vector2D.from3D(pos);
		let rang = cmpVision.GetRange();
		let vegres = cmpUnitAI.FindNearbyResource(posi, filter, rang);
		if (vegres)
		{
			cmpUnitAI.PerformGather(vegres, false, true, true, false, false);//(target, queued, force, pushFront = false, redrop = true, full = true)
		}
	}	
}
VeganSupplies.prototype.ExecuteConsumption = function()
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
				if (carried.type == "vegan")
				{
					carry = carried.amount;
				}
			}
		}
		if (cmpResourceGatherer && carry)
		{
			let res = [];
			let elm = {};
			elm.type = "vegan";
			elm.amount = carry - 1;
			res.push(elm)
			cmpResourceGatherer.GiveResources(res);
			this.Increase(1);
			//the Omnivors should be able to survive on vegan only diets
			let cmpMeatSupplies = Engine.QueryInterface(this.entity, IID_MeatSupplies);
			if(cmpMeatSupplies)
				cmpMeatSupplies.Increase(0.5);
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
VeganSupplies.prototype.CheckDecayTimer = function()
{
	if (this.decayTimer)
		return;

	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	let timer = Math.round(600000 / this.decayRate);
	this.regenTimer = cmpTimer.SetInterval(this.entity, IID_VeganSupplies, "ExecuteDecay", timer, timer, null);
};
VeganSupplies.prototype.CheckHungerTimer = function()
{
	if (this.hungerTimer)
		return;

	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	this.hungerTimer = cmpTimer.SetInterval(this.entity, IID_VeganSupplies, "LookForVegan", 1000, 1000, null);
};
VeganSupplies.prototype.CheckStarveTimer = function()
{
	if (this.starveTimer)
		return;
	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	let timer = Math.round(60000 / this.starveEffect);
	this.starveTimer = cmpTimer.SetInterval(this.entity, IID_VeganSupplies, "HandleStarve", timer, timer, null);
};
VeganSupplies.prototype.CheckConsumeTimer = function()
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
	this.consumeTimer = cmpTimer.SetInterval(this.entity, IID_VeganSupplies, "ExecuteConsumption", timer, timer, null);
};

VeganSupplies.prototype.Reduce = function(amount)
{
	if (!amount || !this.supplies)
		return { "suppliesChange": 0 };
	// Before changing the value, activate Fogging if necessary to hide changes
	let cmpFogging = Engine.QueryInterface(this.entity, IID_Fogging);
	if (cmpFogging)
		cmpFogging.Activate();

	let oldVeganSupplies = this.supplies;
	// If we reached 0, then starve.
	if (amount >= this.supplies)
	{
		this.supplies = 0;
		//this.RegisterVeganSuppliesChanged(oldVeganSupplies);
		return { "suppliesChange": -oldVeganSupplies };
	}

	this.supplies -= amount;
	//this.RegisterVeganSuppliesChanged(oldHitpoints);
	return { "suppliesChange": this.supplies - oldVeganSupplies };
};

/**
 * Handle what happens when the entity starves.
 */
VeganSupplies.prototype.HandleStarve = function()
{
	if (this.GetVeganSupplies() == 0)
	{
		let cmpHealth = Engine.QueryInterface(this.entity, IID_Health);
		if (cmpHealth)
			cmpHealth.Reduce(Math.round(Math.random() * 2));
	}
};

VeganSupplies.prototype.Increase = function(amount)
{
	// Before changing the value, activate Fogging if necessary to hide changes
	let cmpFogging = Engine.QueryInterface(this.entity, IID_Fogging);
	if (cmpFogging)
		cmpFogging.Activate();

	if (!this.IsHungry())
		return { "old": this.supplies, "new": this.supplies };

	let old = this.supplies;
	this.supplies = Math.min(this.supplies + amount, this.GetMaxVeganSupplies());

	//this.RegisterVeganSuppliesChanged(old);

	return { "old": old, "new": this.supplies };
};
/**
VeganSupplies.prototype.RecalculateValues = function()
{
	let oldMaxVeganSupplies = this.GetMaxVeganSupplies();
	let newMaxVeganSupplies = ApplyValueModificationsToEntity("VeganSupplies/Max", +this.template.Max, this.entity);
	if (oldMaxVeganSupplies != newMaxVeganSupplies)
	{
		let newVeganSupplies = this.supplies * newMaxVeganSupplies/oldMaxVeganSupplies;
		this.maxVeganSupplies = newMaxVeganSupplies;
		this.SetVeganSupplies(newVeganSupplies);
	}

	let oldDecayRate = this.decayRate;
	this.decayRate = ApplyValueModificationsToEntity("VeganSupplies/decayRate", +this.template.DecayRate, this.entity);

	let oldConsumeRate = this.consumeRate;
	this.consumeRate = ApplyValueModificationsToEntity("VeganSupplies/ConsumeRate", +this.template.ConsumeRate, this.entity);

	if (this.decayRate != oldDecayRate || this.consumeRate != oldConsumeRate)
		this.CheckDecayTimer();
};

VeganSupplies.prototype.OnValueModification = function(msg)
{
	if (msg.component == "VeganSupplies")
		this.RecalculateValues();
};

VeganSupplies.prototype.OnOwnershipChanged = function(msg)
{
	if (msg.to != INVALID_PLAYER)
		this.RecalculateValues();
};

VeganSupplies.prototype.RegisterVeganSuppliesChanged = function(from)
{
	this.CheckDecayTimer();
	Engine.PostMessage(this.entity, MT_VeganSuppliesChanged, { "from": from, "to": this.supplies });
};
**/
function VeganSuppliesMirage() {}
VeganSuppliesMirage.prototype.Init = function(cmpVeganSupplies)
{
	this.maxVeganSupplies = cmpVeganSupplies.GetMaxVeganSupplies();
	this.supplies = cmpVeganSupplies.GetVeganSupplies();
	this.hungry = cmpVeganSupplies.IsHungry();
};
VeganSuppliesMirage.prototype.GetMaxVeganSupplies = function() { return this.maxVeganSupplies; };
VeganSuppliesMirage.prototype.GetVeganSupplies = function() { return this.supplies; };
VeganSuppliesMirage.prototype.IsHungry = function() { return this.hungry; };

Engine.RegisterGlobal("VeganSuppliesMirage", VeganSuppliesMirage);

VeganSupplies.prototype.Mirage = function()
{
	let mirage = new VeganSuppliesMirage();
	mirage.Init(this);
	return mirage;
};

Engine.RegisterComponentType(IID_VeganSupplies, "VeganSupplies", VeganSupplies);
