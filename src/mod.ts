import { DependencyContainer }  from "tsyringe";
import { IPostDBLoadMod }       from "@spt/models/external/IPostDBLoadMod";
import { DatabaseServer }       from "@spt/servers/DatabaseServer";
import { ImporterUtil }         from "@spt/utils/ImporterUtil";
import { ILogger }              from "@spt/models/spt/utils/ILogger";
import { PreSptModLoader }      from "@spt/loaders/PreSptModLoader";
import { IDatabaseTables }      from "@spt/models/spt/server/IDatabaseTables";
import { JsonUtil }             from "@spt/utils/JsonUtil"

interface IHandbookEntry {
    Id: string;
    ParentId: string;
    Price: number;
}

class GreenCore implements IPostDBLoadMod 
{
    private db:         IDatabaseTables;
    private mydb:       any;
    private logger:     ILogger;
    private jsonUtil:   JsonUtil;

    public postDBLoad(container: DependencyContainer): void 
    {
        try {
            this.logger =               container.resolve<ILogger>("WinstonLogger");
            this.jsonUtil =             container.resolve<JsonUtil>("JsonUtil");

            const databaseServer =      container.resolve<DatabaseServer>("DatabaseServer");
            const databaseImporter =    container.resolve<ImporterUtil>("ImporterUtil");
            const modLoader =           container.resolve<PreSptModLoader>("PreSptModLoader");

            const modFolderName =   "MoxoPixel-GreenCore";

            const traders = {
                "painter":     "668aaff35fd574b6dcc4a686"
            };

            this.db = databaseServer.getTables();
            this.mydb = databaseImporter.loadRecursive(`${modLoader.getModPath(modFolderName)}database/`);

            if (!this.db || !this.mydb) {
                throw new Error("Failed to load required databases");
            }

            for (const newItem in this.mydb.items) {
                this.cloneItem(this.mydb.items[newItem].clone, newItem);
                this.addCompatibilitiesAndConflicts(this.mydb.items[newItem].clone, newItem);
            
                const newItemLocales = this.mydb.items[newItem].locales;
                for (const lang in this.db.locales.global) {
                    this.db.locales.global[lang][`${newItem} Name`] = newItemLocales.Name;
                    this.db.locales.global[lang][`${newItem} ShortName`] = newItemLocales.Shortname;
                    this.db.locales.global[lang][`${newItem} Description`] = newItemLocales.Description;
                }
            }

            for (const trader in traders) this.addTraderAssort(traders[trader]);

            const dbMastering = this.db.globals.config.Mastering;
            for (const weapon in dbMastering) {
                if (dbMastering[weapon].Name == "MDR") dbMastering[weapon].Templates.push("67c263a4da87832028bdde5c", "67c263a4da87832028bdde5d");
                if (dbMastering[weapon].Name == "M4") dbMastering[weapon].Templates.push("67c263a4da87832028bdde5e");
            }

            const dbQuests = this.db.templates.quests;
            for (const M4Quest in dbQuests) {
                if (
                    dbQuests[M4Quest]._id === "5a27bb8386f7741c770d2d0a" ||
                    dbQuests[M4Quest]._id === "5c0d4c12d09282029f539173" ||
                    dbQuests[M4Quest]._id === "63a9b229813bba58a50c9ee5" ||
                    dbQuests[M4Quest]._id === "64e7b9bffd30422ed03dad38" ||
                    dbQuests[M4Quest]._id === "666314b4d7f171c4c20226c3"
                ) {
                    const availableForFinish = dbQuests[M4Quest].conditions.AvailableForFinish;
                    for (const condition of availableForFinish) {
                        if (condition.counter && condition.counter.conditions) {
                            for (const counterCondition of condition.counter.conditions) {
                                if (counterCondition.weapon) {
                                    counterCondition.weapon.push(
                                        "67c263a4da87832028bdde5e",
                                    );
                                }
                            }
                        }
                    }   
                }
            }

            this.logger.info("------------------------");
            this.logger.info("Green Core Loaded");
        } catch (error) {   
            this.logger.error(`Error loading GreenCore mod: ${error.message}`);
        }
    
    }

    private cloneItem(itemToClone: string, greenCoreID: string): void
    {
        if (!itemToClone || !greenCoreID) {
            this.logger.error("Invalid parameters passed to cloneItem");
            return;
        }

        if (!this.mydb.items[greenCoreID]?.enable) {
            return;
        }

        if (!this.db.templates.items[itemToClone]) {
            this.logger.error(`Template item ${itemToClone} not found`);
            return;
        }

        if ( this.mydb.items[greenCoreID].enable == true ) {
            let greenCoreItemOut = this.jsonUtil.clone(this.db.templates.items[itemToClone]);

            greenCoreItemOut._id = greenCoreID;
            greenCoreItemOut = this.compareAndReplace(greenCoreItemOut, this.mydb.items[greenCoreID]["items"]);

            const gcCompatibilities: object = (typeof this.mydb.items[greenCoreID].gcCompatibilities == "undefined") ? {} : this.mydb.items[greenCoreID].gcCompatibilities;
            const gcConflicts: Array<string> = (typeof this.mydb.items[greenCoreID].gcConflicts == "undefined")      ? [] : this.mydb.items[greenCoreID].gcConflicts;
            for (const modSlotName in gcCompatibilities) {
                for (const slot of greenCoreItemOut._props.Slots) {
                    if ( slot._name === modSlotName ) for (const id of gcCompatibilities[modSlotName]) slot._props.filters[0].Filter.push(id);
                }
            }
            greenCoreItemOut._props.ConflictingItems = greenCoreItemOut._props.ConflictingItems.concat(gcConflicts);

            this.db.templates.items[greenCoreID] = greenCoreItemOut;

            const handbookEntry: IHandbookEntry = {
                "Id": greenCoreID,
                "ParentId": this.mydb.items[greenCoreID]["handbook"]["ParentId"],
                "Price": this.mydb.items[greenCoreID]["handbook"]["Price"]
            };

            this.db.templates.handbook.Items.push(handbookEntry);
        }
    }

    private compareAndReplace(originalItem, attributesToChange)
    {
        for (const key in attributesToChange) {
            if ( (["boolean", "string", "number"].includes(typeof attributesToChange[key])) || Array.isArray(attributesToChange[key]) ) {
                if ( key in originalItem ) originalItem[key] = attributesToChange[key];
                else this.logger.error("Error finding the attribute: \"" + key + "\", default value is used instead.");
            } 
            else originalItem[key] = this.compareAndReplace(originalItem[key], attributesToChange[key]);
        }

        return originalItem;
    }

    private addCompatibilitiesAndConflicts(itemClone: string, greenCoreID: string): void
    {
        for (const item in this.db.templates.items) {
            if ( item in this.mydb.items ) continue;
            
            const slots = (typeof this.db.templates.items[item]._props.Slots === "undefined")            ? [] : this.db.templates.items[item]._props.Slots;
            const chambers = (typeof this.db.templates.items[item]._props.Chambers === "undefined")      ? [] : this.db.templates.items[item]._props.Chambers;
            const cartridges = (typeof this.db.templates.items[item]._props.Cartridges === "undefined")  ? [] : this.db.templates.items[item]._props.Cartridges;
            const combined = slots.concat(chambers, cartridges)

            for (const entry of combined) {
                for (const id of entry._props.filters[0].Filter) {
                    if ( id === itemClone ) entry._props.filters[0].Filter.push(greenCoreID);
                }
            }

            const conflictingItems = (typeof this.db.templates.items[item]._props.ConflictingItems === "undefined") ? [] : this.db.templates.items[item]._props.ConflictingItems;
            for (const conflictID of conflictingItems) if ( conflictID === itemClone ) conflictingItems.push(greenCoreID);
        }
    }

    private addTraderAssort(trader: string): void 
    {
        if (!this.db.traders[trader]?.assort || !this.mydb.traders[trader]?.assort) {
            this.logger.error(`Invalid trader assort data for trader: ${trader}`);
            return;
        }

        for (const item in this.mydb.traders[trader].assort.items) {
            this.db.traders[trader].assort.items.push(this.mydb.traders[trader].assort.items[item]);
        }

        for (const item in this.mydb.traders[trader].assort.barter_scheme) {
            this.db.traders[trader].assort.barter_scheme[item] = this.mydb.traders[trader].assort.barter_scheme[item];
        }

        for (const item in this.mydb.traders[trader].assort.loyal_level_items) {
            this.db.traders[trader].assort.loyal_level_items[item] = this.mydb.traders[trader].assort.loyal_level_items[item];
        }
    }
}

module.exports = { mod: new GreenCore() }
