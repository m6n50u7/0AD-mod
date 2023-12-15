function Turretable() {}

Turretable.prototype.Schema =
	"<empty/>";

Turretable.prototype.Init = function()
{
	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	cmpTimer.SetInterval(this.entity, IID_Turretable, "HorseMovement", 1000, 1000, null);
};

/**
 * @param {string} type - Unused.
 * @param {number} target - The entity ID of the target to check.
 * @return {Object} - The range this entity needs to be in in order to occupy a turret point on the target.
 */
Turretable.prototype.GetRange = function(type, target)
{
	let cmpTurretHolder = Engine.QueryInterface(target, IID_TurretHolder);
	return cmpTurretHolder ? cmpTurretHolder.LoadingRange() : { "min": 0, "max": 1 };
};

/**
 * @return {number} - The entity ID of the entity this entity is turreted on.
 */
Turretable.prototype.HolderID = function()
{
	return this.holder || INVALID_ENTITY;
};

/**
 * @return {boolean} - Whether we're turreted.
 */
Turretable.prototype.IsTurreted = function()
{
	return !!this.holder;
};

/**
 * @return {boolean} - Whether we can leave the turret point.
 */
Turretable.prototype.IsEjectable = function()
{
	return this.ejectable;
};

/**
 * @param {number} target - The entity ID to check.
 * @return {boolean} - Whether we can occupy the turret.
 */
Turretable.prototype.CanOccupy = function(target)
{
	if (this.holder)
		return false;

	let cmpTurretHolder = Engine.QueryInterface(target, IID_TurretHolder);
	return cmpTurretHolder && cmpTurretHolder.CanOccupy(this.entity);
};
/**
 * @return {number} - rideable entity.
 */
Turretable.prototype.Is_rider = function ()
{
	if(!this.holder)
		return 0;
	let cmpTurretHolder = Engine.QueryInterface(this.holder, IID_TurretHolder);
	if(cmpTurretHolder && cmpTurretHolder.Is_rider(this.entity))
		return this.holder;
	else
		return 0;
}

/**
 * @param {number} target - The entity ID of the entity this entity is being turreted on.
 * @param {string} turretPointName - Optionally the turret point name to occupy.
 * @param {boolean} ejectable - Whether we can leave this turret point (e.g. false for a tank turret).
 *
 * @return {boolean} - Whether occupying succeeded.
 */
Turretable.prototype.OccupyTurret = function(target, turretPointName = "", ejectable = true)
{
	if (!this.CanOccupy(target))
		return false;

	let cmpTurretHolder = Engine.QueryInterface(target, IID_TurretHolder);
	if (!cmpTurretHolder || !cmpTurretHolder.OccupyNamedTurretPoint(this.entity, turretPointName))
		return false;

	this.holder = target;
	this.ejectable = ejectable;

	let cmpUnitAI = Engine.QueryInterface(this.entity, IID_UnitAI);
	if (cmpUnitAI && !this.Is_rider())
	{
		cmpUnitAI.SetGarrisoned();
		let cmpTurMotion = Engine.QueryInterface(target, IID_UnitMotion);
		if(!cmpTurMotion)
			cmpUnitAI.SetTurretStance();
	}

	let cmpUnitMotion = Engine.QueryInterface(this.entity, IID_UnitMotion);
	if (cmpUnitMotion)
		cmpUnitMotion.SetFacePointAfterMove(false);

	// Remove the unit's obstruction to avoid interfering with pathing.
	let cmpObstruction = Engine.QueryInterface(this.entity, IID_Obstruction);
	if (cmpObstruction)
		cmpObstruction.SetActive(false);
	//make the horse know he have a rider so that he don't roam while his owner is gathering
	let horse = Engine.QueryInterface(target, IID_UnitAI);
	horse.Rid = true;

	Engine.PostMessage(this.entity, MT_TurretedStateChanged, {
		"oldHolder": INVALID_ENTITY,
		"holderID": target
	});

	return true;
};
Turretable.prototype.HorseMovement = function()
{
	let cmpTurUnitMotion = Engine.QueryInterface(this.HolderID(), IID_UnitMotion);
	if (!cmpTurUnitMotion || !cmpTurUnitMotion.GetCurrentSpeed())
		return;
	let cmpTurPosition = Engine.QueryInterface(this.holder, IID_Position);
	let Turangle = cmpTurPosition.GetRotation().y;
	let cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	let angle = cmpPosition.SetYRotation(Turangle);
}
/**
 * @param {boolean} forced - Optionally whether the leaving the turret is forced.
 * @return {boolean} - Whether leaving the turret succeeded.
 */
Turretable.prototype.LeaveTurret = function(forced = false)
{
	let horse = this.Is_rider();
	if (!this.holder)
		return true;

	if (!this.ejectable && !forced)
		return false;

	let pos = PositionHelper.GetSpawnPosition(this.holder, this.entity, forced);
	if (!pos)
		return false;

	let cmpTurretHolder = Engine.QueryInterface(this.holder, IID_TurretHolder);
	if (!cmpTurretHolder || !cmpTurretHolder.LeaveTurretPoint(this.entity, forced))
		return false;

	let cmpUnitMotionEntity = Engine.QueryInterface(this.entity, IID_UnitMotion);
	if (cmpUnitMotionEntity)
		cmpUnitMotionEntity.SetFacePointAfterMove(true);

	let cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	if (cmpPosition)
	{
		cmpPosition.SetTurretParent(INVALID_ENTITY, new Vector3D());
		cmpPosition.JumpTo(pos.x, pos.z);
		cmpPosition.SetHeightOffset(0);

		let cmpHolderPosition = Engine.QueryInterface(this.holder, IID_Position);
		if (cmpHolderPosition)
			cmpPosition.SetYRotation(cmpHolderPosition.GetPosition().horizAngleTo(pos));
	}

	let cmpUnitAI = Engine.QueryInterface(this.entity, IID_UnitAI);
	if (cmpUnitAI && !horse)
	{
		cmpUnitAI.Ungarrison();
		cmpUnitAI.ResetTurretStance();
	}

	// Reset the obstruction flags to template defaults.
	let cmpObstruction = Engine.QueryInterface(this.entity, IID_Obstruction);
	if (cmpObstruction)
		cmpObstruction.SetActive(true);

	Engine.PostMessage(this.entity, MT_TurretedStateChanged, {
		"oldHolder": this.holder,
		"holderID": INVALID_ENTITY
	});

	let cmpRallyPoint = Engine.QueryInterface(this.holder, IID_RallyPoint);

	// Need to delete this before ordering to a rally
	// point else we may not occupy another turret point.
	delete this.holder;

	if (cmpRallyPoint)
		cmpRallyPoint.OrderToRallyPoint(this.entity, ["occupy-turret"]);

	delete this.ejectable;
	return true;
};

Turretable.prototype.OnEntityRenamed = function(msg)
{
	if (!this.holder)
		return;

	let cmpTurretHolder = Engine.QueryInterface(this.holder, IID_TurretHolder);
	if (!cmpTurretHolder)
		return;

	let holder = this.holder;
	let currentPoint = cmpTurretHolder.GetOccupiedTurretPointName(this.entity);
	this.LeaveTurret(true);
	let cmpTurretableNew = Engine.QueryInterface(msg.newentity, IID_Turretable);
	if (cmpTurretableNew)
		cmpTurretableNew.OccupyTurret(holder, currentPoint);
};

Turretable.prototype.OnOwnershipChanged = function(msg)
{
	if (!this.holder)
		return;

	if (msg.to == INVALID_PLAYER)
		this.LeaveTurret(true);
	//else if (!IsOwnedByMutualAllyOfEntity(this.entity, this.holder))
	//	this.LeaveTurret();
};

Engine.RegisterComponentType(IID_Turretable, "Turretable", Turretable);
