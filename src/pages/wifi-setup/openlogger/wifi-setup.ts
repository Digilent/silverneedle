import { Component, ViewChild, trigger, state, animate, transition, style } from '@angular/core';
import { NavParams, Slides, ViewController, PopoverController, LoadingController, NavController } from 'ionic-angular';

//Services
import { StorageService } from '../../../services/storage/storage.service';
import { SettingsService } from '../../../services/settings/settings.service';
import { DeviceManagerService } from 'dip-angular2/services';

//Components
import { GenPopover } from '../../../components/gen-popover/gen-popover.component';

//Interfaces
import { SavedWifiInfoContainer, WifiInfoContainer, NicStatusContainer } from './wifi-setup.interface';
import { DeviceCardInfo } from '../../device-manager-page/device-manager-page.interface';
import { TooltipService } from '../../../services/tooltip/tooltip.service';

@Component({
    templateUrl: 'wifi-setup.html',
    animations: [
        trigger('expand', [
            state('true', style({ height: '45px' })),
            state('false', style({ height: '0' })),
            transition('void => *', animate('0s')),
            transition('* <=> *', animate('250ms ease-in-out'))
        ]),
        trigger('rotate', [
            state('true', style({ transform: 'rotate(-180deg)' })),
            state('false', style({ transform: 'rotate(0deg)' })),
            transition('void => *', animate('0s')),
            transition('* <=> *', animate('250ms ease-in-out'))
        ])
    ]
})
export class WifiSetupPage {
    @ViewChild('wifiSlider') slider: Slides;
    public storageService: StorageService;
    public settingsService: SettingsService;
    public deviceManagerService: DeviceManagerService;
    public params: NavParams;
    public loadingCtrl: LoadingController;
    public popoverCtrl: PopoverController;
    public viewCtrl: ViewController;
    public savedNetworks: SavedWifiInfoContainer[] = [];
    public availableNetworks: WifiInfoContainer[] = [];
    public selectedNetwork: WifiInfoContainer | SavedWifiInfoContainer = {
        ssid: null,
        bssid: null,
        securityType: null,
        channel: null,
        signalStrength: null
    };
    public save: boolean = true;
    public autoConnect: boolean = true;
    public disableAutoConnect: boolean = false;
    public connectNow: boolean = true;
    public password: string = '';
    public scanningForNetworks: boolean = false;
    public maxAttemptCount: number = 20;
    public currentAttemptCount: number = 0;

    public availableNics: string[] = ['None'];
    public selectedNic: string = 'None';
    public currentNicStatus: NicStatusContainer = {
        adapter: null,
        securityType: null,
        status: null,
        ssid: null
    }

    public wifiStatus: string = 'Ready';

    public selectedStorageLocation: string = 'None';
    public storageLocations: string[] = ['None'];

    public showAdvancedSettings: boolean = false;
    public showPassword: boolean = false;

    public wepKeyIndex: number = 0;
    public wepKeyArray: string[] = [];
    public wepKeyEntryArray: number[] = [0, 1, 2, 3];
    public modifyingSaved: boolean = false;
    public showMainAdvanced: boolean = false;
    public customNetworkConfig: boolean = false;
    public securityTypes: string[] = ['wpa2', 'wpa', 'wep40', 'wep104', 'open'];
    public deviceObject: DeviceCardInfo;

    public networkDropMessage: string = "Scanning the available wifi networks requires the device to disconnect from the network";

    constructor(
        _storageService: StorageService,
        _settingsService: SettingsService,
        _deviceManagerService: DeviceManagerService,
        _params: NavParams,
        _viewCtrl: ViewController,
        _loadingCtrl: LoadingController,
        _popoverCtrl: PopoverController,
        public navCtrl: NavController,
        public tooltipService: TooltipService
    ) {
        this.storageService = _storageService;
        this.settingsService = _settingsService;
        this.deviceManagerService = _deviceManagerService;
        this.popoverCtrl = _popoverCtrl;
        this.loadingCtrl = _loadingCtrl;
        this.params = _params;
        this.viewCtrl = _viewCtrl;
        this.deviceObject = this.params.get('deviceObject');
        console.log('wifi constructor');

        this.getNicList()
            .then(() => {
                console.log('get nic list done');

                return this.getNicStatus(this.selectedNic);
            })
            .then((data: NicStatusContainer) => {
                console.log('disconnect done or autoresolve');

                this.currentNicStatus = data;

                return this.getStorageLocations();
            })
            .catch((e) => {
                console.log('caught error');
                console.log(e);
            })
            .then(() => {
                return this.getSavedWifiNetworks(this.selectedStorageLocation);
            })
            .catch((e) => {
                console.log('caught error');
                console.log(e);
            });
    }

    toggleAdvancedSettings() {
        this.showAdvancedSettings = !this.showAdvancedSettings;
    }

    toggleMainAdvanced() {
        this.showMainAdvanced = !this.showMainAdvanced;
    }

    customNetworkSecuritySelect(event) {
        this.selectedNetwork.securityType = event;
    }

    displayLoading(message?: string) {
        message = message || 'Loading...';
        let loading = this.loadingCtrl.create({
            content: message,
            spinner: 'crescent',
            cssClass: 'custom-loading-indicator'
        });

        loading.present();

        return loading;
    }

    manualDisconnect() {
        this.disconnectFromNetwork(this.selectedNic)
            .then((data) => {
                console.log(data);
                this.getNicStatus(this.selectedNic)
                    .then((data) => {
                        this.currentNicStatus = data;
                    })
                    .catch((e) => {
                        console.log(e);
                    });
            })
            .catch((e) => {
                console.log(e);
            });
    }

    //Need to use this lifestyle hook to make sure the slider exists before trying to get a reference to it
    ionViewDidEnter() {
        let swiperInstance: any = this.slider.getSlider();
        if (swiperInstance == undefined) {
            setTimeout(() => {
                this.ionViewDidEnter();
            }, 20);
            return;
        }
        swiperInstance.lockSwipes();
    }

    nicSelection(event) {
        console.log(event);
        this.selectedNic = event;
    }

    storageSelection(event) {
        console.log(event);
        this.selectedStorageLocation = event;
        this.getSavedWifiNetworks(event).catch((e) => { });
    }

    private getFutureDate(secondsFromNow) {
        return new Date(Date.now() + secondsFromNow * 1000);
    }

    loadAndConnect(savedDeviceIndex: number) {
        if (this.deviceObject && !this.deviceObject.bridge) {
            let decision = confirm('Connecting to a network over wifi will send you back to the Device Manager Page. Are you sure?');
            if (!decision) {
                return;
            }
        }

        let loading = this.displayLoading('Connecting To Saved Network...');

        this.loadWifiNetwork(this.savedNetworks[savedDeviceIndex].storageLocation, this.savedNetworks[savedDeviceIndex].ssid)
            .then((data) => {
                console.log(data);
                return new Promise((resolve) => {
                    setTimeout(resolve, data.device[0].wait + 3000); // note(andrew): Some time is needed after issuing the wifiLoadParameters command for the device to finish
                });
            })
            .then(() => {
                return this.connectToNetwork(this.selectedNic, 'workingParameterSet', true);
            })
            .then(() => {
                console.log("Waiting to connect");
                let timeoutDate = this.getFutureDate(20);
                return this.readNicUntilConnected(timeoutDate)
            })
            .then(_ => {
                return this.getNicStatus(this.selectedNic)
            })
            .then(data => {
                this.currentNicStatus = data;
            }) 
            .then(() => {
                loading.dismiss();
                if (this.deviceObject && !this.deviceObject.bridge) {
                    this.closeModal(true);
                }
            })
            .catch((e) => {
                console.log('error loading and connecting to network');
                loading.dismiss();
                if (this.deviceObject && !this.deviceObject.bridge) {
                    this.closeModal(true);
                }
            });
    }

    updateSavedNetwork() {
        let loading = this.displayLoading('Updating Network');
        this.loadWifiNetwork((<SavedWifiInfoContainer>this.selectedNetwork).storageLocation, this.selectedNetwork.ssid)
            .then(() => {
                return this.deleteSavedWifiNetwork((<SavedWifiInfoContainer>this.selectedNetwork).storageLocation, this.selectedNetwork.ssid);
            })
            .then(() => {
                if (this.selectedNetwork.securityType === 'wpa' || this.selectedNetwork.securityType === 'wpa2') {
                    this.wifiSetParameters(this.selectedNic, this.selectedNetwork.ssid, this.selectedNetwork.securityType, (<SavedWifiInfoContainer>this.selectedNetwork).autoConnect, this.password)
                        .then(() => {
                            return this.saveWifiNetwork(this.selectedStorageLocation);
                        })
                        .then(() => {
                            if (this.connectNow && this.deviceObject && this.deviceObject.bridge) {
                                setTimeout(() => {
                                    console.log('return promise');
                                    return this.connectToNetwork(this.selectedNic, "workingParameterSet", true);
                                }, 500);
                            }
                            else {
                                return new Promise((resolve, reject) => { resolve(); });
                            }
                        })
                        .then(() => {
                            loading.dismiss();
                            this.getSavedWifiNetworks(this.selectedStorageLocation).then(() => { }).catch((e) => { });
                            this.backToNetworks();
                        })
                        .catch((e) => {
                            console.log('error updating parameters');
                            this.wifiStatus = 'Error updating wifi parameters.';
                            loading.dismiss();
                        });
                }
                else {
                    let formattedKeyArray = this.wepKeyArray.join(':');
                    console.log(formattedKeyArray);
                    this.wifiSetParameters(this.selectedNic, this.selectedNetwork.ssid, this.selectedNetwork.securityType, (<SavedWifiInfoContainer>this.selectedNetwork).autoConnect, undefined, formattedKeyArray, this.wepKeyIndex)
                        .then(() => {
                            if (this.connectNow && this.deviceObject && this.deviceObject.bridge) {
                                return this.connectToNetwork(this.selectedNic, "workingParameterSet", true);
                            }
                            else {
                                return new Promise((resolve, reject) => { resolve(); });
                            }
                        })
                        .then(() => {
                            loading.dismiss();
                            this.getSavedWifiNetworks(this.selectedStorageLocation).then(() => { }).catch((e) => { });
                            this.backToNetworks();
                        })
                        .catch((e) => {
                            loading.dismiss();
                            console.log('error updating parameters');
                            this.wifiStatus = 'Error updating wifi parameters.';
                        });
                }
            })
            .catch((e) => {

            })
            .catch((e) => {

            });

    }

    refreshAvailableNetworks() {
        this.getNicStatus(this.selectedNic)
            .then((data) => {
                console.log(data);
                this.currentNicStatus = data;
                if (this.currentNicStatus.status === 'connected' || this.currentNicStatus.status === 'connecting') {
                    return this.disconnectFromNetwork(this.selectedNic);
                }
                else {
                    return new Promise((resolve, reject) => { resolve(); });
                }
            })
            .catch((e) => {
                console.log('error getting nic status');
            })
            .then(() => {
                return this.getNicStatus(this.selectedNic);
            })
            .then((data) => {
                this.currentNicStatus = data;
                return this.scanWifi(this.selectedNic);
            })
            .catch((e) => {
                console.log('caught error disconnecting or scanning');
            });
    }

    addCustomNetwork() {
        this.disableAutoConnect = false;
        this.password = '';
        this.save = true;
        this.autoConnect = true;
        this.connectNow = true;
        this.wifiStatus = 'Ready';
        this.selectedNetwork = {
            ssid: '',
            bssid: '',
            securityType: 'wpa2',
            channel: 0,
            signalStrength: 0
        };
        this.customNetworkConfig = true;
        let swiperInstance: any = this.slider.getSlider();
        swiperInstance.unlockSwipes();
        this.slider.slideTo(1);
        swiperInstance.lockSwipes();
    }

    getNicList(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.deviceManagerService.devices[this.deviceManagerService.activeDeviceIndex].nicList().subscribe(
                (data) => {
                    console.log(data);
                    this.availableNics = data.device[0].nics;
                    this.selectedNic = data.device[0].nics[0];
                    resolve(data);
                },
                (err) => {
                    reject(err);
                    console.log(err);
                },
                () => { }
            );
        });
    }

    getStorageLocations(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.deviceManagerService.devices[this.deviceManagerService.activeDeviceIndex].storageGetLocations().subscribe(
                (data) => {
                    this.storageLocations = data.device[0].storageLocations;
                    this.selectedStorageLocation = this.storageLocations[0];
                    resolve(data);
                    console.log(data);
                },
                (err) => {
                    reject(err);
                    console.log(err);
                },
                () => { }
            );

        });
    }

    populateListFromCommand(networks: any) {
        let networkList: WifiInfoContainer[] = [];
        for (let network in networks) {
            let networkInfoContainer: WifiInfoContainer = {
                ssid: networks[network].ssid || null,
                bssid: networks[network].bssid || null,
                securityType: networks[network].securityType || null,
                channel: networks[network].channel || null,
                signalStrength: networks[network].signalStrength || null
            };
            if (!networks[network].ssid || networks[network].ssid === "") {
                networkInfoContainer.ssid = networkInfoContainer.bssid;
            }
            networkList.push(networkInfoContainer);
        }
        networkList.sort((a: WifiInfoContainer, b: WifiInfoContainer) => {
            return b.signalStrength - a.signalStrength;
        });
        this.availableNetworks = networkList;
    }

    getNicStatus(adapter: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.deviceManagerService.devices[this.deviceManagerService.activeDeviceIndex].nicGetStatus(adapter).subscribe(
                (data) => {
                    let nicStatusContainer = {
                        statusCode: data.device[0].statusCode,
                        adapter: data.device[0].adapter,
                        status: data.device[0].status,
                        ipAddress: data.device[0].ipAddress,
                        ssid: data.device[0].ssid,
                        securityType: data.device[0].securityType,
                        reason: data.device[0].reason
                    }
            
                    resolve(nicStatusContainer);
                },
                (err) => {
                    reject(err);
                    console.log(err);
                },
                () => { }
            );

        });
    }

    scanWifi(adapter: string) {
        this.deviceManagerService.devices[this.deviceManagerService.activeDeviceIndex].wifiScan(adapter).subscribe(
            (data) => {
                console.log(data);
                this.scanningForNetworks = true;
                this.currentAttemptCount = 0;
                setTimeout(() => {
                    this.readScannedWifiNetworks(adapter);
                }, 500);
            },
            (err) => {
                console.log(err);
            },
            () => { }
        );
    }

    readScannedWifiNetworks(adapter: string) {
        this.deviceManagerService.devices[this.deviceManagerService.activeDeviceIndex].wifiReadScannedNetworks(adapter).subscribe(
            (data) => {
                console.log(data);
                this.scanningForNetworks = false;
                this.populateListFromCommand(data.device[0].networks);
            },
            (err) => {
                console.log(err);
                if (err.device !== undefined && err.device[0].reason === 4 && this.currentAttemptCount < this.maxAttemptCount) { // if reason === 4 then still working on req
                    this.currentAttemptCount++;
                    setTimeout(() => {
                        this.readScannedWifiNetworks(adapter);
                    }, 500);
                }
                else {
                    this.scanningForNetworks = false;
                }
            },
            () => { }
        );
    }

    wifiSetParameters(adapter: string, ssid: string, securityType: 'wep40' | 'wep104' | 'wpa' | 'wpa2' | 'open',
        autoConnect: boolean, passphrase?: string, keys?: string, keyIndex?: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this.deviceManagerService.devices[this.deviceManagerService.activeDeviceIndex].wifiSetParameters(adapter, ssid, securityType, autoConnect, passphrase, keys, keyIndex).subscribe(
                (data) => {
                    console.log(data);
                    resolve(data);
                },
                (err) => {
                    console.log(err);
                    reject(err);
                },
                () => { }
            );
        });

    }

    refreshSavedNetworks() {
        console.log(this.selectedStorageLocation);
        this.getSavedWifiNetworks(this.selectedStorageLocation).catch((e) => { });
    }

    getSavedWifiNetworks(storageLocation: string): Promise<any> {
        this.savedNetworks = [];
        return new Promise((resolve, reject) => {
            this.deviceManagerService.devices[this.deviceManagerService.activeDeviceIndex].wifiListSavedParameters(storageLocation).subscribe(
                (data) => {
                    this.parseSavedParameters(data.device[0].parameterSet, storageLocation);
                    resolve(data);
                },
                (err) => {
                    console.log(err);
                    reject(err);
                },
                () => { }
            );
        });
    }

    parseSavedParameters(parameterSets, storageLocation: string) {
        console.log(parameterSets);
        if (parameterSets.length < 1) { return; }
        for (let i = 0; i < parameterSets.length; i++) {
            this.savedNetworks.push({
                ssid: parameterSets[i].ssid,
                bssid: '',
                securityType: parameterSets[i].securityType,
                storageLocation: storageLocation,
                autoConnect: parameterSets[i].autoConnect
            });
        }
    }

    deleteSavedWifiNetwork(storageLocation: string, ssid: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.deviceManagerService.devices[this.deviceManagerService.activeDeviceIndex].wifiDeleteParameters(storageLocation, ssid).subscribe(
                (data) => {
                    console.log(data);
                    resolve(data);
                },
                (err) => {
                    console.log(err);
                    reject(err);
                },
                () => { }
            );
        });
    }

    connectToNetwork(adapter: string, parameterSet: 'activeParameterSet' | 'workingParameterSet', force: boolean): Promise<any> {
        return new Promise((resolve, reject) => {
            this.deviceManagerService.devices[this.deviceManagerService.activeDeviceIndex].nicConnect(adapter, parameterSet, force).subscribe(
                (data) => {
                    console.log(data);
                    resolve(data);
                },
                (err) => {
                    console.log(err);
                    reject(err);
                },
                () => { }
            );
        });
    }

    disconnectFromNetwork(adapter): Promise<any> {
        return new Promise((resolve, reject) => {
            this.deviceManagerService.devices[this.deviceManagerService.activeDeviceIndex].nicDisconnect(adapter).subscribe(
                (data) => {
                    console.log(data);
                    resolve(data);
                },
                (err) => {
                    console.log(err);
                    reject(err);
                },
                () => { }
            );
        });
    }

    saveWifiNetwork(storageLocation: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.deviceManagerService.devices[this.deviceManagerService.activeDeviceIndex].wifiSaveParameters(storageLocation).subscribe(
                (data) => {
                    console.log(data);
                    resolve(data);
                },
                (err) => {
                    console.log(err);
                    reject(err);
                },
                () => { }
            );
        });
    }

    loadWifiNetwork(storageLocation: string, ssid: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.deviceManagerService.devices[this.deviceManagerService.activeDeviceIndex].wifiLoadParameters(storageLocation, ssid).subscribe(
                (data) => {
                    console.log(data);
                    resolve(data);
                },
                (err) => {
                    console.log(err);
                    reject(err);
                },
                () => { }
            );
        });
    }

    checkboxChanged(checkboxName: string) {
        if (checkboxName === 'save' && !this.save) {
            this.autoConnect = false;
            setTimeout(() => { this.disableAutoConnect = true; }, 20);
        }
        if (checkboxName === 'save' && this.save) {
            this.disableAutoConnect = false;
        }
    }

    routeToConfigSlide(network) {
        this.customNetworkConfig = false;
        this.disableAutoConnect = false;
        this.password = '';
        this.save = true;
        this.autoConnect = true;
        this.connectNow = true;
        this.selectedNetwork = network;
        this.wifiStatus = 'Ready';
        let swiperInstance: any = this.slider.getSlider();
        swiperInstance.unlockSwipes();
        this.slider.slideTo(1);
        swiperInstance.lockSwipes();
    }

    /***************************************************************************
     * Continuously polls the NIC status until the device has connected to a
     * network, or until the timeout date is met.
     * @param timeoutDate Date object representing a time at which this method
     *  should timeout.
     * @return This function returns a Promise that rejects when the timeoutDate
     *  is met or if this#getNicStatus fails and resolves otherwise.
    ***************************************************************************/
    readNicUntilConnected(timeoutDate: Date): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (timeoutDate.getTime() < Date.now()) return reject("Failed to connect to the network");

            setTimeout(() => { // wait 500ms to give device time to process last request
                this.getNicStatus(this.selectedNic)
                    .then((data) => {
                        if (data.statusCode !== 0) return reject('An error has occured while connecting. Please try again.');
                        
                        if (data.status === 'connected' && data.ipAddress !== 'none') {
                            resolve();
                        } else if (data.status === 'disconnected' && data.reason != 4) {
                            reject(new Error("Failed connecting"));
                        } else {
                            this.readNicUntilConnected(timeoutDate)
                                .then(resolve)
                                .catch((e) => {
                                    reject(e); // bubble the error up through the promise chain
                                });
                        }
                    })
                    .catch((e) => {
                        reject(e);
                    });
            }, 500);
        });
    }

    addNetwork() {
        for (let i = 0; i < this.savedNetworks.length; i++) {
            if (JSON.stringify(this.selectedNetwork) === JSON.stringify(this.savedNetworks[i])) {
                //Exists already. Modify existing?TODO
                return;
            }
        }
        if (this.selectedNetwork.ssid === '' && this.selectedNetwork.bssid === '') {
            this.wifiStatus = 'Please enter a valid SSID.';
            return;
        }
        let loading;
        if (this.customNetworkConfig) {
            loading = this.displayLoading('Adding Network');
        }
        else {
            loading = this.displayLoading('Connecting To Network');
        }
        if (this.selectedNetwork.securityType === 'wpa' || this.selectedNetwork.securityType === 'wpa2' || this.selectedNetwork.securityType === 'open') {
            this.wifiSetParameters(this.selectedNic, this.selectedNetwork.ssid, this.selectedNetwork.securityType, this.autoConnect, this.selectedNetwork.securityType === 'open' ? '' : this.password)
                .then(() => { // connect to network
                    if (this.connectNow && this.deviceObject && this.deviceObject.bridge) {
                        this.connectToNetwork(this.selectedNic, "workingParameterSet", true);
                        return true;
                    }
                    else {
                        return false;
                    }
                })
                .then((waitToConnect = true) => { // wait to connect
                    let timeoutDate = this.getFutureDate(20);
                    
                    return (waitToConnect === true) ? this.readNicUntilConnected(timeoutDate) : Promise.resolve();
                })
                .then(() => { // save network config
                    if (this.save) {
                        return this.saveWifiNetwork(this.selectedStorageLocation);
                    }
                    else {
                        return new Promise((resolve, reject) => { resolve(); });
                    }
                })
                .then(() => {
                    loading.dismiss();
                    if (this.save) {
                        //TODO
                        /*this.savedNetworks.unshift(this.selectedNetwork);*/
                        this.getSavedWifiNetworks(this.selectedStorageLocation).then(() => { }).catch((e) => { });
                    }
                    this.backToNetworks();
                })
                .catch((e) => {
                    console.log('error setting parameters: ', e);
                    this.wifiStatus = 'Error setting wifi parameters.';
                    loading.dismiss();
                });
        }
        else {
            let formattedKeyArray = this.wepKeyArray.join(':');
            console.log(formattedKeyArray);
            this.wifiSetParameters(this.selectedNic, this.selectedNetwork.ssid, this.selectedNetwork.securityType, this.autoConnect, undefined, formattedKeyArray, this.wepKeyIndex)
                .then(() => {
                    if (this.connectNow && this.deviceObject && this.deviceObject.bridge) {
                        return this.connectToNetwork(this.selectedNic, "workingParameterSet", true);
                    }
                    else {
                        return new Promise((resolve, reject) => { resolve(); });
                    }
                })
                .then(() => {
                    /*this.savedNetworks.unshift(this.selectedNetwork);*/
                    //TODO
                    this.backToNetworks();
                })
                .catch((e) => {
                    console.log('error setting parameters');
                    this.wifiStatus = 'Error setting wifi parameters.';
                });
        }
    }

    backToNetworks() {
        let swiperInstance: any = this.slider.getSlider();
        swiperInstance.unlockSwipes();
        this.slider.slideTo(0);
        swiperInstance.lockSwipes();
        this.modifyingSaved = false;
    }

    showPopover(event, savedNetworkIndex: number) {
        event.stopPropagation();
        let popover = this.popoverCtrl.create(GenPopover, {
            dataArray: ['Forget', 'Modify']
        });
        popover.onWillDismiss((data) => {
            if (data == null) { return; }
            if (data.option === 'Forget') {
                console.log('forget');
                this.deleteSavedWifiNetwork(this.savedNetworks[savedNetworkIndex].storageLocation, this.savedNetworks[savedNetworkIndex].ssid)
                    .then(() => {
                        this.wifiStatus = 'Done deleting saved network.';
                        this.getSavedWifiNetworks(this.selectedStorageLocation);
                    })
                    .catch((e) => {
                        this.wifiStatus = 'Error deleting saved network.';
                    });
            }
            else if (data.option === 'Modify') {
                console.log('modify');
                this.modifyingSaved = true;
                //Wait before moving to allow for Angular2 change detection to update config slide view
                setTimeout(() => {
                    this.routeToConfigSlide(this.savedNetworks[savedNetworkIndex]);
                }, 100);
            }
        });
        popover.present({
            ev: event
        });
    }

    closeModal(backToDeviceManagerPage?: boolean) {
        backToDeviceManagerPage = backToDeviceManagerPage == undefined ? false : backToDeviceManagerPage;
        if (backToDeviceManagerPage) {
            this.viewCtrl.dismiss({
                toDeviceManagerPage: true
            });
            return;
        }
        this.getNicStatus(this.selectedNic)
            .then((data) => {
                this.viewCtrl.dismiss(data);
            })
            .catch((e) => {
                this.viewCtrl.dismiss();
            });
    }

}