function Builder() {}

Builder.prototype.Schema =
	"<a:help>Allows the unit to construct and repair buildings.</a:help>" +
	"<a:example>" +
		"<Rate>1.0</Rate>" +
		"<Entities datatype='tokens'>" +
			"\n    structures/{civ}/barracks\n    structures/{native}/civil_centre\n    structures/pers/apadana\n  " +
		"</Entities>" +
	"</a:example>" +
	"<element name='Rate' a:help='Construction speed multiplier (1.0 is normal speed, higher values are faster).'>" +
		"<ref name='positiveDecimal'/>" +
	"</element>" +
	"<element name='Entities' a:help='Space-separated list of entity template names that this unit can build. The special string \"{civ}\" will be automatically replaced by the civ code of the unit&apos;s owner, while the string \"{native}\" will be automatically replaced by the unit&apos;s civ code. This element can also be empty, in which case no new foundations may be placed by the unit, but they can still repair existing buildings.'>" +
		"<attribute name='datatype'>" +
			"<value>tokens</value>" +
		"</attribute>" +
		"<text/>" +
	"</element>";

/*
 * Build interval and repeat time, in ms.
 */
Builder.prototype.BUILD_INTERVAL = 1000;

Builder.prototype.Init = function()
{
};

Builder.prototype.GetEntitiesList = function()
{
	let string = this.template.Entities._string;
	if (!string)
		return [];

	let cmpPlayer = QueryOwnerInterface(this.entity);
	if (!cmpPlayer)
		return [];

	string = ApplyValueModificationsToEntity("Builder/Entities/_string", string, this.entity);

	let cmpIdentity = Engine.QueryInterface(this.entity, IID_Identity);
	if (cmpIdentity)
		string = string.replace(/\{native\}/g, cmpIdentity.GetCiv());

	const entities = string.replace(/\{civ\}/g, QueryOwnerInterface(this.entity, IID_Identity).GetCiv()).split(/\s+/);

	let disabledTemplates = cmpPlayer.GetDisabledTemplates();

	let cmpTemplateManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);

	return entities.filter(ent => !disabledTemplates[ent] && cmpTemplateManager.TemplateExists(ent));
};

Builder.prototype.GetRange = function()
{
	let max = 2;
	let cmpObstruction = Engine.QueryInterface(this.entity, IID_Obstruction);
	if (cmpObstruction)
		max += cmpObstruction.GetSize();

	return { "max": max, "min": 0 };
};

Builder.prototype.GetRate = function()
{
	return ApplyValueModificationsToEntity("Builder/Rate", +this.template.Rate, this.entity);
};

/**
 * @param {number} target - The target to check.
 * @return {boolean} - Whether we can build/repair the given target.
 */
Builder.prototype.CanRepair = function(target)
{
	let cmpFoundation = QueryMiragedInterface(target, IID_Foundation);
	let cmpRepairable = QueryMiragedInterface(target, IID_Repairable);
	if (!cmpFoundation && (!cmpRepairable || !cmpRepairable.IsRepairable()))
		return false;

	let cmpOwnership = Engine.QueryInterface(this.entity, IID_Ownership);
	return cmpOwnership && IsOwnedByAllyOfPlayer(cmpOwnership.GetOwner(), target);
};

/**
 * @param {number} target - The target to repair.
 * @param {number} callerIID - The IID to notify on specific events.
 * @return {boolean} - Whether we started repairing.
 */
Builder.prototype.StartRepairing = function(target, callerIID)
{
	this.targeted = target;
	if (this.target)
		this.StopRepairing();

	if (!this.CanRepair(target))
		return false;

	let cmpBuilderList = QueryBuilderListInterface(target);
	if (cmpBuilderList)
		cmpBuilderList.AddBuilder(this.entity);

	let cmpVisual = Engine.QueryInterface(this.entity, IID_Visual);
	if (cmpVisual)
		cmpVisual.SelectAnimation("build", false, 1.0);

	this.target = target;
	this.callerIID = callerIID;

	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	this.timer = cmpTimer.SetInterval(this.entity, IID_Builder, "PerformBuilding", this.BUILD_INTERVAL, this.BUILD_INTERVAL, null);

	return true;
};

/**
 * @param {string} reason - The reason why we stopped repairing.
 */
Builder.prototype.StopRepairing = function(reason)
{
	if (!this.target)
		return;

	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	cmpTimer.CancelTimer(this.timer);
	delete this.timer;

	let cmpBuilderList = QueryBuilderListInterface(this.target);
	if (cmpBuilderList)
		cmpBuilderList.RemoveBuilder(this.entity);

	delete this.target;

	let cmpVisual = Engine.QueryInterface(this.entity, IID_Visual);
	if (cmpVisual)
		cmpVisual.SelectAnimation("idle", false, 1.0);

	// The callerIID component may start again,
	// replacing the callerIID, hence save that.
	let callerIID = this.callerIID;
	delete this.callerIID;

	if (reason && callerIID)
	{
		let component = Engine.QueryInterface(this.entity, callerIID);
		if (component)
			component.ProcessMessage(reason, null);
	}
};

/**
 * Repair our target entity.
 * @params - data and lateness are unused.
 */
Builder.prototype.PerformBuilding = function(data, lateness)
{
	if (!this.CanRepair(this.target))
	{
		this.StopRepairing("TargetInvalidated");
		return;
	}

	if (!this.IsTargetInRange(this.target))
	{
		this.StopRepairing("OutOfRange");
		return;
	}
	let cmpFoundation = Engine.QueryInterface(this.target, IID_Foundation);
	let type = "";
	let carry = 0;
	let cmpResourceGatherer = Engine.QueryInterface(this.entity, IID_ResourceGatherer);
	let car = cmpResourceGatherer.GetCarryingStatus();
	let cost = {};
	let c = Engine.QueryInterface(this.target, IID_Cost).GetResourceCosts();
	let res = 0;
	let main;
	for(let i in c)
	{
		if(c[i] > res)
		{
			res = c[i];
			main = i;
		}
	}
	cost[main] = 1;
	if (car)
	{
		for(let carried of car)
		{
			if (carried.amount)
			{
					type = carried.type;
					carry = carried.amount;
			}
		}
	}
	let maxwork;
	if(cmpFoundation)
	{
		cost = cmpFoundation.GetResourceCosts();
		maxwork = Math.min(this.GetRate(), (Math.min(carry, cmpFoundation.GetNeededResourceCount(type)) / cmpFoundation.GetResRate()) * this.GetRate());
	}
	else if(type == main)
	{
		maxwork = this.GetRate();
	}
	if (maxwork)
	{
		let res = [];
		let elm = {};
		elm.type = type;
		if(cmpFoundation)
			elm.amount = carry - Math.ceil(maxwork * cmpFoundation.GetResRate() * cmpFoundation.buildMultiplier);
		else
			elm.amount = carry - 1;

		res.push(elm);
		cmpResourceGatherer.GiveResources(res);
		if(cmpFoundation)
			cmpFoundation.ReduceNeededResourceCount(type, Math.floor(maxwork * cmpFoundation.GetResRate() * cmpFoundation.buildMultiplier));
	}
	else
	{
		this.StopRepairing();
		let tries = 0;
		for(let reso in cost)
		{
			if(cmpFoundation && cmpFoundation.GetNeededResourceCount(reso))
			{
				let filter = (ent, type, template) => {
				let cmpRes = Engine.QueryInterface(ent, IID_ResourceSupply);
				if (type.generic == reso && cmpRes.GetCurrentAmount())
					return true;};
				let cmpUnitAI = Engine.QueryInterface(this.entity, IID_UnitAI);
				let cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
				let pos = cmpPosition.GetPosition();
				let cmpVision = Engine.QueryInterface(this.entity, IID_Vision);
				let posi = Vector2D.from3D(pos);
				let rang = cmpVision.GetRange();
				let res = cmpUnitAI.FindNearbyResource(posi, filter, rang);
				if (res && !tries)
				{
					tries = 1;
					cmpUnitAI.PerformGather(res, true, false, true, false);
				}
				break;
			}
			else if(!cmpFoundation)
			{
				let filter = (ent, type, template) => {
				let cmpRes = Engine.QueryInterface(ent, IID_ResourceSupply);
				if (type.generic == reso && cmpRes.GetCurrentAmount())
					return true;};
				let cmpUnitAI = Engine.QueryInterface(this.entity, IID_UnitAI);
				let cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
				let pos = cmpPosition.GetPosition();
				let cmpVision = Engine.QueryInterface(this.entity, IID_Vision);
				let posi = Vector2D.from3D(pos);
				let rang = cmpVision.GetRange();
				let res = cmpUnitAI.FindNearbyResource(posi, filter, rang);
				if (res && !tries)
				{
					tries = 1;
					cmpUnitAI.PerformGather(res, true, false, true, false);
				}
				break;
			}
		}
		return;
	}
	// ToDo: Enable entities to keep facing a target.
	Engine.QueryInterface(this.entity, IID_UnitAI)?.FaceTowardsTarget(this.target);

	if (cmpFoundation)
	{
		cmpFoundation.Build(this.entity, maxwork);
		return;
	}

	let cmpRepairable = Engine.QueryInterface(this.target, IID_Repairable);
	if (cmpRepairable)
	{
		cmpRepairable.Repair(this.entity, this.GetRate());
		return;
	}
};

/**
 * @param {number} - The entity ID of the target to check.
 * @return {boolean} - Whether this entity is in range of its target.
 */
Builder.prototype.IsTargetInRange = function(target)
{
	let range = this.GetRange();
	let cmpObstructionManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_ObstructionManager);
	return cmpObstructionManager.IsInTargetRange(this.entity, target, range.min, range.max, false);
};

Builder.prototype.OnValueModification = function(msg)
{
	if (msg.component != "Builder" || !msg.valueNames.some(name => name.endsWith('_string')))
		return;

	// Token changes may require selection updates.
	let cmpPlayer = QueryOwnerInterface(this.entity, IID_Player);
	if (cmpPlayer)
		Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface).SetSelectionDirty(cmpPlayer.GetPlayerID());
};

Engine.RegisterComponentType(IID_Builder, "Builder", Builder);
