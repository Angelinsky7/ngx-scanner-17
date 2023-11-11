import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { BrowserCodeReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { BrowserMultiFormatContinuousReader } from './browser-multi-format-continuous-reader';
import * as i0 from "@angular/core";
export class ZXingScannerComponent {
    /**
     * Exposes the current code reader, so the user can use it's APIs.
     */
    get codeReader() {
        return this._codeReader;
    }
    /**
     * User device input
     */
    set device(device) {
        if (!this._ready) {
            this._devicePreStart = device;
            // let's ignore silently, users don't like logs
            return;
        }
        if (this.isAutostarting) {
            // do not allow setting devices during auto-start, since it will set one and emit it.
            console.warn('Avoid setting a device during auto-start.');
            return;
        }
        if (this.isCurrentDevice(device)) {
            console.warn('Setting the same device is not allowed.');
            return;
        }
        if (!this.hasPermission) {
            console.warn('Permissions not set yet, waiting for them to be set to apply device change.');
            // this.permissionResponse
            //   .pipe(
            //     take(1),
            //     tap(() => console.log(`Permissions set, applying device change${device ? ` (${device.deviceId})` : ''}.`))
            //   )
            //   .subscribe(() => this.device = device);
            return;
        }
        this.setDevice(device);
    }
    /**
     * User device accessor.
     */
    get device() {
        return this._device;
    }
    /**
     * Returns all the registered formats.
     */
    get formats() {
        return this.hints.get(DecodeHintType.POSSIBLE_FORMATS);
    }
    /**
     * Registers formats the scanner should support.
     *
     * @param input BarcodeFormat or case-insensitive string array.
     */
    set formats(input) {
        if (typeof input === 'string') {
            throw new Error('Invalid formats, make sure the [formats] input is a binding.');
        }
        // formats may be set from html template as BarcodeFormat or string array
        const formats = input.map(f => this.getBarcodeFormatOrFail(f));
        const hints = this.hints;
        // updates the hints
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
        // handles updating the codeReader
        this.hints = hints;
    }
    /**
     * Returns all the registered hints.
     */
    get hints() {
        return this._hints;
    }
    /**
     * Does what it takes to set the hints.
     */
    set hints(hints) {
        this._hints = hints;
        // new instance with new hints.
        this.codeReader?.setHints(this._hints);
    }
    /**
     * Sets the desired constraints in all video tracks.
     * @experimental
     */
    set videoConstraints(constraints) {
        // new instance with new hints.
        const controls = this.codeReader?.getScannerControls();
        if (!controls) {
            // fails silently
            return;
        }
        controls?.streamVideoConstraintsApply(constraints);
    }
    /**
     *
     */
    set isAutostarting(state) {
        this._isAutostarting = state;
        this.autostarting.next(state);
    }
    /**
     *
     */
    get isAutostarting() {
        return this._isAutostarting;
    }
    /**
     * Can turn on/off the device flashlight.
     *
     * @experimental Torch/Flash APIs are not stable in all browsers, it may be buggy!
     */
    set torch(onOff) {
        try {
            const controls = this.getCodeReader().getScannerControls();
            controls.switchTorch(onOff);
        }
        catch (error) {
            // ignore error
        }
    }
    /**
     * Starts and Stops the scanning.
     */
    set enable(enabled) {
        this._enabled = Boolean(enabled);
        if (!this._enabled) {
            this.reset();
            BrowserMultiFormatContinuousReader.releaseAllStreams();
        }
        else {
            if (this.device) {
                this.scanFromDevice(this.device.deviceId);
            }
            else {
                this.init();
            }
        }
    }
    /**
     * Tells if the scanner is enabled or not.
     */
    get enabled() {
        return this._enabled;
    }
    /**
     * If is `tryHarder` enabled.
     */
    get tryHarder() {
        return this.hints.get(DecodeHintType.TRY_HARDER);
    }
    /**
     * Enable/disable tryHarder hint.
     */
    set tryHarder(enable) {
        const hints = this.hints;
        if (enable) {
            hints.set(DecodeHintType.TRY_HARDER, true);
        }
        else {
            hints.delete(DecodeHintType.TRY_HARDER);
        }
        this.hints = hints;
    }
    /**
     * Constructor to build the object and do some DI.
     */
    constructor() {
        /**
         * Delay between attempts to decode (default is 500ms)
         */
        this.timeBetweenScans = 500;
        /**
         * Delay between successful decode (default is 500ms)
         */
        this.delayBetweenScanSuccess = 500;
        /**
         * How the preview element should be fit inside the :host container.
         */
        this.previewFitMode = 'cover';
        /**
         * Url of the HTML video poster
         */
        this.poster = '';
        this._ready = false;
        // instance based emitters
        this.autostarted = new EventEmitter();
        this.autostarting = new EventEmitter();
        this.torchCompatible = new EventEmitter(false);
        this.scanSuccess = new EventEmitter();
        this.scanFailure = new EventEmitter();
        this.scanError = new EventEmitter();
        this.scanComplete = new EventEmitter();
        this.camerasFound = new EventEmitter();
        this.camerasNotFound = new EventEmitter();
        this.permissionResponse = new EventEmitter(true);
        this.hasDevices = new EventEmitter();
        this.deviceChange = new EventEmitter();
        this._enabled = true;
        this._hints = new Map();
        this.autofocusEnabled = true;
        this.autostart = true;
        this.formats = [BarcodeFormat.QR_CODE];
        // computed data
        this.hasNavigator = typeof navigator !== 'undefined';
        this.isMediaDevicesSupported = this.hasNavigator && !!navigator.mediaDevices;
    }
    /**
     * Gets and registers all cameras.
     */
    async askForPermission() {
        if (!this.hasNavigator) {
            console.error('@zxing/ngx-scanner', 'Can\'t ask permission, navigator is not present.');
            this.setPermission(null);
            return this.hasPermission;
        }
        if (!this.isMediaDevicesSupported) {
            console.error('@zxing/ngx-scanner', 'Can\'t get user media, this is not supported.');
            this.setPermission(null);
            return this.hasPermission;
        }
        let stream;
        let permission;
        try {
            // Will try to ask for permission
            stream = await this.getAnyVideoDevice();
            permission = !!stream;
        }
        catch (err) {
            return this.handlePermissionException(err);
        }
        finally {
            this.terminateStream(stream);
        }
        this.setPermission(permission);
        // Returns the permission
        return permission;
    }
    /**
     *
     */
    getAnyVideoDevice() {
        return navigator.mediaDevices.getUserMedia({ video: true });
    }
    /**
     * Terminates a stream and it's tracks.
     */
    terminateStream(stream) {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }
        stream = undefined;
    }
    async init() {
        if (!this.autostart) {
            console.warn('Feature \'autostart\' disabled. Permissions and devices recovery has to be run manually.');
            // does the necessary configuration without autostarting
            this.initAutostartOff();
            this._ready = true;
            return;
        }
        // configures the component and starts the scanner
        await this.initAutostartOn();
        this._ready = true;
    }
    /**
     * Initializes the component without starting the scanner.
     */
    initAutostartOff() {
        // do not ask for permission when autostart is off
        this.isAutostarting = false;
        // just update devices information
        this.updateVideoInputDevices();
        if (this._device && this._devicePreStart) {
            this.setDevice(this._devicePreStart);
        }
    }
    /**
     * Initializes the component and starts the scanner.
     * Permissions are asked to accomplish that.
     */
    async initAutostartOn() {
        this.isAutostarting = true;
        let hasPermission;
        try {
            // Asks for permission before enumerating devices so it can get all the device's info
            hasPermission = await this.askForPermission();
        }
        catch (e) {
            console.error('Exception occurred while asking for permission:', e);
            return;
        }
        // from this point, things gonna need permissions
        if (hasPermission) {
            const devices = await this.updateVideoInputDevices();
            await this.autostartScanner([...devices]);
        }
        this.isAutostarting = false;
        this.autostarted.next();
    }
    /**
     * Checks if the given device is the current defined one.
     */
    isCurrentDevice(device) {
        return device?.deviceId === this._device?.deviceId;
    }
    /**
     * Executes some actions before destroy the component.
     */
    ngOnDestroy() {
        this.reset();
        BrowserMultiFormatContinuousReader.releaseAllStreams();
    }
    /**
     *
     */
    ngOnInit() {
        this.init();
    }
    /**
     * Stops the scanning, if any.
     */
    scanStop() {
        if (this._scanSubscription) {
            this.codeReader?.getScannerControls().stop();
            this._scanSubscription?.unsubscribe();
            this._scanSubscription = undefined;
        }
        this.torchCompatible.next(false);
    }
    /**
     * Stops the scanning, if any.
     */
    scanStart() {
        if (this._scanSubscription) {
            throw new Error('There is already a scan process running.');
        }
        if (!this._device) {
            throw new Error('No device defined, cannot start scan, please define a device.');
        }
        this.scanFromDevice(this._device.deviceId);
    }
    /**
     * Stops old `codeReader` and starts scanning in a new one.
     */
    restart() {
        // note only necessary for now because of the Torch
        this._codeReader = undefined;
        const prevDevice = this._reset();
        if (!prevDevice) {
            return;
        }
        this.device = prevDevice;
    }
    /**
     * Discovers and updates known video input devices.
     */
    async updateVideoInputDevices() {
        // permissions aren't needed to get devices, but to access them and their info
        const devices = await BrowserCodeReader.listVideoInputDevices() || [];
        const hasDevices = devices && devices.length > 0;
        // stores discovered devices and updates information
        this.hasDevices.next(hasDevices);
        this.camerasFound.next([...devices]);
        if (!hasDevices) {
            this.camerasNotFound.next(null);
        }
        return devices;
    }
    /**
     * Starts the scanner with the back camera otherwise take the last
     * available device.
     */
    async autostartScanner(devices) {
        const matcher = ({ label }) => /back|trás|rear|traseira|environment|ambiente/gi.test(label);
        // select the rear camera by default, otherwise take the last camera.
        const device = devices.find(matcher) || devices.pop();
        if (!device) {
            throw new Error('Impossible to autostart, no input devices available.');
        }
        await this.setDevice(device);
        this.deviceChange.next(device);
    }
    /**
     * Dispatches the scan success event.
     *
     * @param result the scan result.
     */
    dispatchScanSuccess(result) {
        this.scanSuccess.next(result.getText());
    }
    /**
     * Dispatches the scan failure event.
     */
    dispatchScanFailure(reason) {
        this.scanFailure.next(reason);
    }
    /**
     * Dispatches the scan error event.
     *
     * @param error the error thing.
     */
    dispatchScanError(error) {
        if (!this.scanError.observed) {
            console.error(`zxing scanner component: ${error.name}`, error);
            console.warn('Use the `(scanError)` property to handle errors like this!');
        }
        this.scanError.next(error);
    }
    /**
     * Dispatches the scan event.
     *
     * @param result the scan result.
     */
    dispatchScanComplete(result) {
        this.scanComplete.next(result);
    }
    /**
     * Returns the filtered permission.
     */
    handlePermissionException(err) {
        // failed to grant permission to video input
        console.error('@zxing/ngx-scanner', 'Error when asking for permission.', err);
        let permission;
        switch (err.name) {
            // usually caused by not secure origins
            case 'NotSupportedError':
                console.warn('@zxing/ngx-scanner', err.message);
                // could not claim
                permission = null;
                // can't check devices
                this.hasDevices.next(null);
                break;
            // user denied permission
            case 'NotAllowedError':
                console.warn('@zxing/ngx-scanner', err.message);
                // claimed and denied permission
                permission = false;
                // this means that input devices exists
                this.hasDevices.next(true);
                break;
            // the device has no attached input devices
            case 'NotFoundError':
                console.warn('@zxing/ngx-scanner', err.message);
                // no permissions claimed
                permission = null;
                // because there was no devices
                this.hasDevices.next(false);
                // tells the listener about the error
                this.camerasNotFound.next(err);
                break;
            case 'NotReadableError':
                console.warn('@zxing/ngx-scanner', 'Couldn\'t read the device(s)\'s stream, it\'s probably in use by another app.');
                // no permissions claimed
                permission = null;
                // there are devices, which I couldn't use
                this.hasDevices.next(false);
                // tells the listener about the error
                this.camerasNotFound.next(err);
                break;
            default:
                console.warn('@zxing/ngx-scanner', 'I was not able to define if I have permissions for camera or not.', err);
                // unknown
                permission = null;
                // this.hasDevices.next(undefined;
                break;
        }
        this.setPermission(permission);
        // tells the listener about the error
        this.permissionResponse.error(err);
        return permission;
    }
    /**
     * Returns a valid BarcodeFormat or fails.
     */
    getBarcodeFormatOrFail(format) {
        return typeof format === 'string'
            ? BarcodeFormat[format.trim().toUpperCase()]
            : format;
    }
    /**
     * Return a code reader, create one if non exist
     */
    getCodeReader() {
        if (!this._codeReader) {
            const options = {
                delayBetweenScanAttempts: this.timeBetweenScans,
                delayBetweenScanSuccess: this.delayBetweenScanSuccess
            };
            this._codeReader = new BrowserMultiFormatContinuousReader(this.hints, options);
        }
        return this._codeReader;
    }
    /**
     * Starts the continuous scanning for the given device.
     *
     * @param deviceId The deviceId from the device.
     */
    async scanFromDevice(deviceId) {
        const videoElement = this.previewElemRef.nativeElement;
        const codeReader = this.getCodeReader();
        const scanStream = await codeReader.scanFromDeviceObservable(deviceId, videoElement);
        if (!scanStream) {
            throw new Error('Undefined decoding stream, aborting.');
        }
        const next = (x) => this._onDecodeResult(x.result, x.error);
        const error = (err) => this._onDecodeError(err);
        const complete = () => {
        };
        this._scanSubscription = scanStream.subscribe(next, error, complete);
        if (this._scanSubscription.closed) {
            return;
        }
        const controls = codeReader.getScannerControls();
        const hasTorchControl = typeof controls.switchTorch !== 'undefined';
        this.torchCompatible.next(hasTorchControl);
    }
    /**
     * Handles decode errors.
     */
    _onDecodeError(err) {
        this.dispatchScanError(err);
        // this.reset();
    }
    /**
     * Handles decode results.
     */
    _onDecodeResult(result, error) {
        if (result) {
            this.dispatchScanSuccess(result);
        }
        else {
            this.dispatchScanFailure(error);
        }
        this.dispatchScanComplete(result);
    }
    /**
     * Stops the code reader and returns the previous selected device.
     */
    _reset() {
        if (!this._codeReader) {
            return;
        }
        // clearing codeReader first to prevent setOptions error appearing in several Chromium versions
        this._codeReader = undefined;
        const device = this._device;
        // do not set this.device inside this method, it would create a recursive loop
        this.device = undefined;
        return device;
    }
    /**
     * Resets the scanner and emits device change.
     */
    reset() {
        this._reset();
        this.deviceChange.emit(null);
    }
    /**
     * Sets the current device.
     */
    async setDevice(device) {
        // instantly stops the scan before changing devices
        this.scanStop();
        // correctly sets the new (or none) device
        this._device = device || undefined;
        if (!this._device) {
            // cleans the video because user removed the device
            BrowserCodeReader.cleanVideoSource(this.previewElemRef.nativeElement);
        }
        // if enabled, starts scanning
        if (this._enabled && device) {
            await this.scanFromDevice(device.deviceId);
        }
    }
    /**
     * Sets the permission value and emits the event.
     */
    setPermission(hasPermission) {
        this.hasPermission = hasPermission;
        this.permissionResponse.next(hasPermission);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.0.2", ngImport: i0, type: ZXingScannerComponent, deps: [], target: i0.ɵɵFactoryTarget.Component }); }
    static { this.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "17.0.2", type: ZXingScannerComponent, selector: "zxing-scanner", inputs: { autofocusEnabled: "autofocusEnabled", timeBetweenScans: "timeBetweenScans", delayBetweenScanSuccess: "delayBetweenScanSuccess", autostart: "autostart", previewFitMode: "previewFitMode", poster: "poster", device: "device", formats: "formats", videoConstraints: "videoConstraints", torch: "torch", enable: "enable", tryHarder: "tryHarder" }, outputs: { autostarted: "autostarted", autostarting: "autostarting", torchCompatible: "torchCompatible", scanSuccess: "scanSuccess", scanFailure: "scanFailure", scanError: "scanError", scanComplete: "scanComplete", camerasFound: "camerasFound", camerasNotFound: "camerasNotFound", permissionResponse: "permissionResponse", hasDevices: "hasDevices", deviceChange: "deviceChange" }, viewQueries: [{ propertyName: "previewElemRef", first: true, predicate: ["preview"], descendants: true, static: true }], ngImport: i0, template: "<video #preview [style.object-fit]=\"previewFitMode\" [poster]=\"poster\">\r\n  <p>\r\n    Your browser does not support this feature, please try to upgrade it.\r\n  </p>\r\n  <p>\r\n    Seu navegador n\u00E3o suporta este recurso, por favor tente atualiz\u00E1-lo.\r\n  </p>\r\n</video>\r\n", styles: [":host{display:block}video{width:100%;height:auto;object-fit:contain}\n"], changeDetection: i0.ChangeDetectionStrategy.OnPush }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.0.2", ngImport: i0, type: ZXingScannerComponent, decorators: [{
            type: Component,
            args: [{ selector: 'zxing-scanner', changeDetection: ChangeDetectionStrategy.OnPush, template: "<video #preview [style.object-fit]=\"previewFitMode\" [poster]=\"poster\">\r\n  <p>\r\n    Your browser does not support this feature, please try to upgrade it.\r\n  </p>\r\n  <p>\r\n    Seu navegador n\u00E3o suporta este recurso, por favor tente atualiz\u00E1-lo.\r\n  </p>\r\n</video>\r\n", styles: [":host{display:block}video{width:100%;height:auto;object-fit:contain}\n"] }]
        }], ctorParameters: () => [], propDecorators: { previewElemRef: [{
                type: ViewChild,
                args: ['preview', { static: true }]
            }], autofocusEnabled: [{
                type: Input
            }], timeBetweenScans: [{
                type: Input
            }], delayBetweenScanSuccess: [{
                type: Input
            }], autostarted: [{
                type: Output
            }], autostarting: [{
                type: Output
            }], autostart: [{
                type: Input
            }], previewFitMode: [{
                type: Input
            }], poster: [{
                type: Input
            }], torchCompatible: [{
                type: Output
            }], scanSuccess: [{
                type: Output
            }], scanFailure: [{
                type: Output
            }], scanError: [{
                type: Output
            }], scanComplete: [{
                type: Output
            }], camerasFound: [{
                type: Output
            }], camerasNotFound: [{
                type: Output
            }], permissionResponse: [{
                type: Output
            }], hasDevices: [{
                type: Output
            }], device: [{
                type: Input
            }], deviceChange: [{
                type: Output
            }], formats: [{
                type: Input
            }], videoConstraints: [{
                type: Input
            }], torch: [{
                type: Input
            }], enable: [{
                type: Input
            }], tryHarder: [{
                type: Input
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoienhpbmctc2Nhbm5lci5jb21wb25lbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9wcm9qZWN0cy96eGluZy1zY2FubmVyL3NyYy9saWIvenhpbmctc2Nhbm5lci5jb21wb25lbnQudHMiLCIuLi8uLi8uLi8uLi9wcm9qZWN0cy96eGluZy1zY2FubmVyL3NyYy9saWIvenhpbmctc2Nhbm5lci5jb21wb25lbnQuaHRtbCJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsdUJBQXVCLEVBQ3ZCLFNBQVMsRUFFVCxZQUFZLEVBQ1osS0FBSyxFQUdMLE1BQU0sRUFDTixTQUFTLEVBQ1YsTUFBTSxlQUFlLENBQUM7QUFDdkIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDbkQsT0FBTyxFQUNMLGFBQWEsRUFDYixjQUFjLEVBR2YsTUFBTSxnQkFBZ0IsQ0FBQztBQUV4QixPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQzs7QUFVOUYsTUFBTSxPQUFPLHFCQUFxQjtJQStKaEM7O09BRUc7SUFDSCxJQUFJLFVBQVU7UUFDWixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDMUIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsSUFDSSxNQUFNLENBQUMsTUFBbUM7UUFFNUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDaEIsSUFBSSxDQUFDLGVBQWUsR0FBRyxNQUFNLENBQUM7WUFDOUIsK0NBQStDO1lBQy9DLE9BQU87U0FDUjtRQUVELElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRTtZQUN2QixxRkFBcUY7WUFDckYsT0FBTyxDQUFDLElBQUksQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDO1lBQzFELE9BQU87U0FDUjtRQUVELElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNoQyxPQUFPLENBQUMsSUFBSSxDQUFDLHlDQUF5QyxDQUFDLENB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QkFjRixNQUFNO3NCQURULEtBQUs7Z0JBbUNGLFNBQVM7c0JBRFosS0FBSyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XHJcbiAgQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3ksXHJcbiAgQ29tcG9uZW50LFxyXG4gIEVsZW1lbnRSZWYsXHJcbiAgRXZlbnRFbWl0dGVyLFxyXG4gIElucHV0LFxyXG4gIE9uRGVzdHJveSxcclxuICBPbkluaXQsXHJcbiAgT3V0cHV0LFxyXG4gIFZpZXdDaGlsZFxyXG59IGZyb20gJ0Bhbmd1bGFyL2NvcmUnO1xyXG5pbXBvcnQgeyBCcm93c2VyQ29kZVJlYWRlciB9IGZyb20gJ0B6eGluZy9icm93c2VyJztcclxuaW1wb3J0IHtcclxuICBCYXJjb2RlRm9ybWF0LFxyXG4gIERlY29kZUhpbnRUeXBlLFxyXG4gIEV4Y2VwdGlvbixcclxuICBSZXN1bHRcclxufSBmcm9tICdAenhpbmcvbGlicmFyeSc7XHJcbmltcG9ydCB7IFN1YnNjcmlwdGlvbiB9IGZyb20gJ3J4anMnO1xyXG5pbXBvcnQgeyBCcm93c2VyTXVsdGlGb3JtYXRDb250aW51b3VzUmVhZGVyIH0gZnJvbSAnLi9icm93c2VyLW11bHRpLWZvcm1hdC1jb250aW51b3VzLXJlYWRlcic7XHJcbmltcG9ydCB7IFJlc3VsdEFuZEVycm9yIH0gZnJvbSAnLi9SZXN1bHRBbmRFcnJvcic7XHJcblxyXG5cclxuQENvbXBvbmVudCh7XHJcbiAgc2VsZWN0b3I6ICd6eGluZy1zY2FubmVyJyxcclxuICB0ZW1wbGF0ZVVybDogJy4venhpbmctc2Nhbm5lci5jb21wb25lbnQuaHRtbCcsXHJcbiAgc3R5bGVVcmxzOiBbJy4venhpbmctc2Nhbm5lci5jb21wb25lbnQuc2NzcyddLFxyXG4gIGNoYW5nZURldGVjdGlvbjogQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3kuT25QdXNoXHJcbn0pXHJcbmV4cG9ydCBjbGFzcyBaWGluZ1NjYW5uZXJDb21wb25lbnQgaW1wbGVtZW50cyBPbkluaXQsIE9uRGVzdHJveSB7XHJcblxyXG4gIC8qKlxyXG4gICAqIFN1cHBvcnRlZCBIaW50cyBtYXAuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBfaGludHM6IE1hcDxEZWNvZGVIaW50VHlwZSwgYW55PiB8IG51bGw7XHJcblxyXG4gIC8qKlxyXG4gICAqIFRoZSBaWGluZyBjb2RlIHJlYWRlci5cclxuICAgKi9cclxuICBwcml2YXRlIF9jb2RlUmVhZGVyOiBCcm93c2VyTXVsdGlGb3JtYXRDb250aW51b3VzUmVhZGVyO1xyXG5cclxuICAvKipcclxuICAgKiBUaGUgZGV2aWNlIHRoYXQgc2hvdWxkIGJlIHVzZWQgdG8gc2NhbiB0aGluZ3MuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBfZGV2aWNlOiBNZWRpYURldmljZUluZm87XHJcblxyXG4gIC8qKlxyXG4gICAqIFRoZSBkZXZpY2UgdGhhdCBzaG91bGQgYmUgdXNlZCB0byBzY2FuIHRoaW5ncy5cclxuICAgKi9cclxuICBwcml2YXRlIF9lbmFibGVkOiBib29sZWFuO1xyXG5cclxuICAvKipcclxuICAgKlxyXG4gICAqL1xyXG4gIHByaXZhdGUgX2lzQXV0b3N0YXJ0aW5nOiBib29sZWFuO1xyXG5cclxuICAvKipcclxuICAgKiBIYXMgYG5hdmlnYXRvcmAgYWNjZXNzLlxyXG4gICAqL1xyXG4gIHByaXZhdGUgaGFzTmF2aWdhdG9yOiBib29sZWFuO1xyXG5cclxuICAvKipcclxuICAgKiBTYXlzIGlmIHNvbWUgbmF0aXZlIEFQSSBpcyBzdXBwb3J0ZWQuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBpc01lZGlhRGV2aWNlc1N1cHBvcnRlZDogYm9vbGVhbjtcclxuXHJcbiAgLyoqXHJcbiAgICogSWYgdGhlIHVzZXItYWdlbnQgYWxsb3dlZCB0aGUgdXNlIG9mIHRoZSBjYW1lcmEgb3Igbm90LlxyXG4gICAqL1xyXG4gIHByaXZhdGUgaGFzUGVybWlzc2lvbjogYm9vbGVhbiB8IG51bGw7XHJcblxyXG4gIC8qKlxyXG4gICAqIFVuc3Vic2NyaWJlIHRvIHN0b3Agc2Nhbm5pbmcuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBfc2NhblN1YnNjcmlwdGlvbj86IFN1YnNjcmlwdGlvbjtcclxuXHJcbiAgLyoqXHJcbiAgICogUmVmZXJlbmNlIHRvIHRoZSBwcmV2aWV3IGVsZW1lbnQsIHNob3VsZCBiZSB0aGUgYHZpZGVvYCB0YWcuXHJcbiAgICovXHJcbiAgQFZpZXdDaGlsZCgncHJldmlldycsIHsgc3RhdGljOiB0cnVlIH0pXHJcbiAgcHJldmlld0VsZW1SZWY6IEVsZW1lbnRSZWY8SFRNTFZpZGVvRWxlbWVudD47XHJcblxyXG4gIC8qKlxyXG4gICAqIEVuYWJsZSBvciBkaXNhYmxlIGF1dG9mb2N1cyBvZiB0aGUgY2FtZXJhIChtaWdodCBoYXZlIGFuIGltcGFjdCBvbiBwZXJmb3JtYW5jZSlcclxuICAgKi9cclxuICBASW5wdXQoKVxyXG4gIGF1dG9mb2N1c0VuYWJsZWQ6IGJvb2xlYW47XHJcblxyXG4gIC8qKlxyXG4gICAqIERlbGF5IGJldHdlZW4gYXR0ZW1wdHMgdG8gZGVjb2RlIChkZWZhdWx0IGlzIDUwMG1zKVxyXG4gICAqL1xyXG4gIEBJbnB1dCgpXHJcbiAgdGltZUJldHdlZW5TY2FucyA9IDUwMDtcclxuXHJcbiAgLyoqXHJcbiAgICogRGVsYXkgYmV0d2VlbiBzdWNjZXNzZnVsIGRlY29kZSAoZGVmYXVsdCBpcyA1MDBtcylcclxuICAgKi9cclxuICBASW5wdXQoKVxyXG4gIGRlbGF5QmV0d2VlblNjYW5TdWNjZXNzID0gNTAwO1xyXG5cclxuICAvKipcclxuICAgKiBFbWl0cyB3aGVuIGFuZCBpZiB0aGUgc2Nhbm5lciBpcyBhdXRvc3RhcnRlZC5cclxuICAgKi9cclxuICBAT3V0cHV0KClcclxuICBhdXRvc3RhcnRlZDogRXZlbnRFbWl0dGVyPHZvaWQ+O1xyXG5cclxuICAvKipcclxuICAgKiBUcnVlIGR1cmluZyBhdXRvc3RhcnQgYW5kIGZhbHNlIGFmdGVyLiBJdCB3aWxsIGJlIG51bGwgaWYgd29uJ3QgYXV0b3N0YXJ0IGF0IGFsbC5cclxuICAgKi9cclxuICBAT3V0cHV0KClcclxuICBhdXRvc3RhcnRpbmc6IEV2ZW50RW1pdHRlcjxib29sZWFuPjtcclxuXHJcbiAgLyoqXHJcbiAgICogSWYgdGhlIHNjYW5uZXIgc2hvdWxkIGF1dG9zdGFydCB3aXRoIHRoZSBmaXJzdCBhdmFpbGFibGUgZGV2aWNlLlxyXG4gICAqL1xyXG4gIEBJbnB1dCgpXHJcbiAgYXV0b3N0YXJ0OiBib29sZWFuO1xyXG5cclxuICAvKipcclxuICAgKiBIb3cgdGhlIHByZXZpZXcgZWxlbWVudCBzaG91bGQgYmUgZml0IGluc2lkZSB0aGUgOmhvc3QgY29udGFpbmVyLlxyXG4gICAqL1xyXG4gIEBJbnB1dCgpXHJcbiAgcHJldmlld0ZpdE1vZGU6ICdmaWxsJyB8ICdjb250YWluJyB8ICdjb3ZlcicgfCAnc2NhbGUtZG93bicgfCAnbm9uZScgPSAnY292ZXInO1xyXG5cclxuICAvKipcclxuICAgKiBVcmwgb2YgdGhlIEhUTUwgdmlkZW8gcG9zdGVyXHJcbiAgICovXHJcbiAgQElucHV0KClcclxuICBwb3N0ZXI6IHN0cmluZyA9ICcnO1xyXG5cclxuICAvKipcclxuICAgKiBFbWl0cyBldmVudHMgd2hlbiB0aGUgdG9yY2ggY29tcGF0aWJpbGl0eSBpcyBjaGFuZ2VkLlxyXG4gICAqL1xyXG4gIEBPdXRwdXQoKVxyXG4gIHRvcmNoQ29tcGF0aWJsZTogRXZlbnRFbWl0dGVyPGJvb2xlYW4+O1xyXG5cclxuICAvKipcclxuICAgKiBFbWl0cyBldmVudHMgd2hlbiBhIHNjYW4gaXMgc3VjY2Vzc2Z1bCBwZXJmb3JtZWQsIHdpbGwgaW5qZWN0IHRoZSBzdHJpbmcgdmFsdWUgb2YgdGhlIFFSLWNvZGUgdG8gdGhlIGNhbGxiYWNrLlxyXG4gICAqL1xyXG4gIEBPdXRwdXQoKVxyXG4gIHNjYW5TdWNjZXNzOiBFdmVudEVtaXR0ZXI8c3RyaW5nPjtcclxuXHJcbiAgLyoqXHJcbiAgICogRW1pdHMgZXZlbnRzIHdoZW4gYSBzY2FuIGZhaWxzIHdpdGhvdXQgZXJyb3JzLCB1c2VmdWwgdG8ga25vdyBob3cgbXVjaCBzY2FuIHRyaWVzIHdoZXJlIG1hZGUuXHJcbiAgICovXHJcbiAgQE91dHB1dCgpXHJcbiAgc2NhbkZhaWx1cmU6IEV2ZW50RW1pdHRlcjxFeGNlcHRpb24gfCB1bmRlZmluZWQ+O1xyXG5cclxuICAvKipcclxuICAgKiBFbWl0cyBldmVudHMgd2hlbiBhIHNjYW4gdGhyb3dzIHNvbWUgZXJyb3IsIHdpbGwgaW5qZWN0IHRoZSBlcnJvciB0byB0aGUgY2FsbGJhY2suXHJcbiAgICovXHJcbiAgQE91dHB1dCgpXHJcbiAgc2NhbkVycm9yOiBFdmVudEVtaXR0ZXI8RXJyb3I+O1xyXG5cclxuICAvKipcclxuICAgKiBFbWl0cyBldmVudHMgd2hlbiBhIHNjYW4gaXMgcGVyZm9ybWVkLCB3aWxsIGluamVjdCB0aGUgUmVzdWx0IHZhbHVlIG9mIHRoZSBRUi1jb2RlIHNjYW4gKGlmIGF2YWlsYWJsZSkgdG8gdGhlIGNhbGxiYWNrLlxyXG4gICAqL1xyXG4gIEBPdXRwdXQoKVxyXG4gIHNjYW5Db21wbGV0ZTogRXZlbnRFbWl0dGVyPFJlc3VsdD47XHJcblxyXG4gIC8qKlxyXG4gICAqIEVtaXRzIGV2ZW50cyB3aGVuIG5vIGNhbWVyYXMgYXJlIGZvdW5kLCB3aWxsIGluamVjdCBhbiBleGNlcHRpb24gKGlmIGF2YWlsYWJsZSkgdG8gdGhlIGNhbGxiYWNrLlxyXG4gICAqL1xyXG4gIEBPdXRwdXQoKVxyXG4gIGNhbWVyYXNGb3VuZDogRXZlbnRFbWl0dGVyPE1lZGlhRGV2aWNlSW5mb1tdPjtcclxuXHJcbiAgLyoqXHJcbiAgICogRW1pdHMgZXZlbnRzIHdoZW4gbm8gY2FtZXJhcyBhcmUgZm91bmQsIHdpbGwgaW5qZWN0IGFuIGV4Y2VwdGlvbiAoaWYgYXZhaWxhYmxlKSB0byB0aGUgY2FsbGJhY2suXHJcbiAgICovXHJcbiAgQE91dHB1dCgpXHJcbiAgY2FtZXJhc05vdEZvdW5kOiBFdmVudEVtaXR0ZXI8YW55PjtcclxuXHJcbiAgLyoqXHJcbiAgICogRW1pdHMgZXZlbnRzIHdoZW4gdGhlIHVzZXJzIGFuc3dlcnMgZm9yIHBlcm1pc3Npb24uXHJcbiAgICovXHJcbiAgQE91dHB1dCgpXHJcbiAgcGVybWlzc2lvblJlc3BvbnNlOiBFdmVudEVtaXR0ZXI8Ym9vbGVhbj47XHJcblxyXG4gIC8qKlxyXG4gICAqIEVtaXRzIGV2ZW50cyB3aGVuIGhhcyBkZXZpY2VzIHN0YXR1cyBpcyB1cGRhdGUuXHJcbiAgICovXHJcbiAgQE91dHB1dCgpXHJcbiAgaGFzRGV2aWNlczogRXZlbnRFbWl0dGVyPGJvb2xlYW4+O1xyXG5cclxuICBwcml2YXRlIF9yZWFkeSA9IGZhbHNlO1xyXG5cclxuICBwcml2YXRlIF9kZXZpY2VQcmVTdGFydDogTWVkaWFEZXZpY2VJbmZvO1xyXG5cclxuICAvKipcclxuICAgKiBFeHBvc2VzIHRoZSBjdXJyZW50IGNvZGUgcmVhZGVyLCBzbyB0aGUgdXNlciBjYW4gdXNlIGl0J3MgQVBJcy5cclxuICAgKi9cclxuICBnZXQgY29kZVJlYWRlcigpOiBCcm93c2VyTXVsdGlGb3JtYXRDb250aW51b3VzUmVhZGVyIHtcclxuICAgIHJldHVybiB0aGlzLl9jb2RlUmVhZGVyO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVXNlciBkZXZpY2UgaW5wdXRcclxuICAgKi9cclxuICBASW5wdXQoKVxyXG4gIHNldCBkZXZpY2UoZGV2aWNlOiBNZWRpYURldmljZUluZm8gfCB1bmRlZmluZWQpIHtcclxuXHJcbiAgICBpZiAoIXRoaXMuX3JlYWR5KSB7XHJcbiAgICAgIHRoaXMuX2RldmljZVByZVN0YXJ0ID0gZGV2aWNlO1xyXG4gICAgICAvLyBsZXQncyBpZ25vcmUgc2lsZW50bHksIHVzZXJzIGRvbid0IGxpa2UgbG9nc1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuaXNBdXRvc3RhcnRpbmcpIHtcclxuICAgICAgLy8gZG8gbm90IGFsbG93IHNldHRpbmcgZGV2aWNlcyBkdXJpbmcgYXV0by1zdGFydCwgc2luY2UgaXQgd2lsbCBzZXQgb25lIGFuZCBlbWl0IGl0LlxyXG4gICAgICBjb25zb2xlLndhcm4oJ0F2b2lkIHNldHRpbmcgYSBkZXZpY2UgZHVyaW5nIGF1dG8tc3RhcnQuJyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5pc0N1cnJlbnREZXZpY2UoZGV2aWNlKSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ1NldHRpbmcgdGhlIHNhbWUgZGV2aWNlIGlzIG5vdCBhbGxvd2VkLicpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCF0aGlzLmhhc1Blcm1pc3Npb24pIHtcclxuICAgICAgY29uc29sZS53YXJuKCdQZXJtaXNzaW9ucyBub3Qgc2V0IHlldCwgd2FpdGluZyBmb3IgdGhlbSB0byBiZSBzZXQgdG8gYXBwbHkgZGV2aWNlIGNoYW5nZS4nKTtcclxuICAgICAgLy8gdGhpcy5wZXJtaXNzaW9uUmVzcG9uc2VcclxuICAgICAgLy8gICAucGlwZShcclxuICAgICAgLy8gICAgIHRha2UoMSksXHJcbiAgICAgIC8vICAgICB0YXAoKCkgPT4gY29uc29sZS5sb2coYFBlcm1pc3Npb25zIHNldCwgYXBwbHlpbmcgZGV2aWNlIGNoYW5nZSR7ZGV2aWNlID8gYCAoJHtkZXZpY2UuZGV2aWNlSWR9KWAgOiAnJ30uYCkpXHJcbiAgICAgIC8vICAgKVxyXG4gICAgICAvLyAgIC5zdWJzY3JpYmUoKCkgPT4gdGhpcy5kZXZpY2UgPSBkZXZpY2UpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5zZXREZXZpY2UoZGV2aWNlKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEVtaXRzIHdoZW4gdGhlIGN1cnJlbnQgZGV2aWNlIGlzIGNoYW5nZWQuXHJcbiAgICovXHJcbiAgQE91dHB1dCgpXHJcbiAgZGV2aWNlQ2hhbmdlOiBFdmVudEVtaXR0ZXI8TWVkaWFEZXZpY2VJbmZvPjtcclxuXHJcbiAgLyoqXHJcbiAgICogVXNlciBkZXZpY2UgYWNjZXNzb3IuXHJcbiAgICovXHJcbiAgZ2V0IGRldmljZSgpIHtcclxuICAgIHJldHVybiB0aGlzLl9kZXZpY2U7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZXR1cm5zIGFsbCB0aGUgcmVnaXN0ZXJlZCBmb3JtYXRzLlxyXG4gICAqL1xyXG4gIGdldCBmb3JtYXRzKCk6IEJhcmNvZGVGb3JtYXRbXSB7XHJcbiAgICByZXR1cm4gdGhpcy5oaW50cy5nZXQoRGVjb2RlSGludFR5cGUuUE9TU0lCTEVfRk9STUFUUyk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZWdpc3RlcnMgZm9ybWF0cyB0aGUgc2Nhbm5lciBzaG91bGQgc3VwcG9ydC5cclxuICAgKlxyXG4gICAqIEBwYXJhbSBpbnB1dCBCYXJjb2RlRm9ybWF0IG9yIGNhc2UtaW5zZW5zaXRpdmUgc3RyaW5nIGFycmF5LlxyXG4gICAqL1xyXG4gIEBJbnB1dCgpXHJcbiAgc2V0IGZvcm1hdHMoaW5wdXQ6IEJhcmNvZGVGb3JtYXRbXSkge1xyXG5cclxuICAgIGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBmb3JtYXRzLCBtYWtlIHN1cmUgdGhlIFtmb3JtYXRzXSBpbnB1dCBpcyBhIGJpbmRpbmcuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gZm9ybWF0cyBtYXkgYmUgc2V0IGZyb20gaHRtbCB0ZW1wbGF0ZSBhcyBCYXJjb2RlRm9ybWF0IG9yIHN0cmluZyBhcnJheVxyXG4gICAgY29uc3QgZm9ybWF0cyA9IGlucHV0Lm1hcChmID0+IHRoaXMuZ2V0QmFyY29kZUZvcm1hdE9yRmFpbChmKSk7XHJcblxyXG4gICAgY29uc3QgaGludHMgPSB0aGlzLmhpbnRzO1xyXG5cclxuICAgIC8vIHVwZGF0ZXMgdGhlIGhpbnRzXHJcbiAgICBoaW50cy5zZXQoRGVjb2RlSGludFR5cGUuUE9TU0lCTEVfRk9STUFUUywgZm9ybWF0cyk7XHJcblxyXG4gICAgLy8gaGFuZGxlcyB1cGRhdGluZyB0aGUgY29kZVJlYWRlclxyXG4gICAgdGhpcy5oaW50cyA9IGhpbnRzO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmV0dXJucyBhbGwgdGhlIHJlZ2lzdGVyZWQgaGludHMuXHJcbiAgICovXHJcbiAgZ2V0IGhpbnRzKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX2hpbnRzO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRG9lcyB3aGF0IGl0IHRha2VzIHRvIHNldCB0aGUgaGludHMuXHJcbiAgICovXHJcbiAgc2V0IGhpbnRzKGhpbnRzOiBNYXA8RGVjb2RlSGludFR5cGUsIGFueT4pIHtcclxuICAgIHRoaXMuX2hpbnRzID0gaGludHM7XHJcbiAgICAvLyBuZXcgaW5zdGFuY2Ugd2l0aCBuZXcgaGludHMuXHJcbiAgICB0aGlzLmNvZGVSZWFkZXI/LnNldEhpbnRzKHRoaXMuX2hpbnRzKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNldHMgdGhlIGRlc2lyZWQgY29uc3RyYWludHMgaW4gYWxsIHZpZGVvIHRyYWNrcy5cclxuICAgKiBAZXhwZXJpbWVudGFsXHJcbiAgICovXHJcbiAgQElucHV0KClcclxuICBzZXQgdmlkZW9Db25zdHJhaW50cyhjb25zdHJhaW50czogTWVkaWFUcmFja0NvbnN0cmFpbnRzKSB7XHJcbiAgICAvLyBuZXcgaW5zdGFuY2Ugd2l0aCBuZXcgaGludHMuXHJcbiAgICBjb25zdCBjb250cm9scyA9IHRoaXMuY29kZVJlYWRlcj8uZ2V0U2Nhbm5lckNvbnRyb2xzKCk7XHJcblxyXG4gICAgaWYgKCFjb250cm9scykge1xyXG4gICAgICAvLyBmYWlscyBzaWxlbnRseVxyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29udHJvbHM/LnN0cmVhbVZpZGVvQ29uc3RyYWludHNBcHBseShjb25zdHJhaW50cyk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKlxyXG4gICAqL1xyXG4gIHNldCBpc0F1dG9zdGFydGluZyhzdGF0ZTogYm9vbGVhbikge1xyXG4gICAgdGhpcy5faXNBdXRvc3RhcnRpbmcgPSBzdGF0ZTtcclxuICAgIHRoaXMuYXV0b3N0YXJ0aW5nLm5leHQoc3RhdGUpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICpcclxuICAgKi9cclxuICBnZXQgaXNBdXRvc3RhcnRpbmcoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5faXNBdXRvc3RhcnRpbmc7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDYW4gdHVybiBvbi9vZmYgdGhlIGRldmljZSBmbGFzaGxpZ2h0LlxyXG4gICAqXHJcbiAgICogQGV4cGVyaW1lbnRhbCBUb3JjaC9GbGFzaCBBUElzIGFyZSBub3Qgc3RhYmxlIGluIGFsbCBicm93c2VycywgaXQgbWF5IGJlIGJ1Z2d5IVxyXG4gICAqL1xyXG4gIEBJbnB1dCgpXHJcbiAgc2V0IHRvcmNoKG9uT2ZmOiBib29sZWFuKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjb250cm9scyA9IHRoaXMuZ2V0Q29kZVJlYWRlcigpLmdldFNjYW5uZXJDb250cm9scygpO1xyXG4gICAgICBjb250cm9scy5zd2l0Y2hUb3JjaChvbk9mZik7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAvLyBpZ25vcmUgZXJyb3JcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFN0YXJ0cyBhbmQgU3RvcHMgdGhlIHNjYW5uaW5nLlxyXG4gICAqL1xyXG4gIEBJbnB1dCgpXHJcbiAgc2V0IGVuYWJsZShlbmFibGVkOiBib29sZWFuKSB7XHJcblxyXG4gICAgdGhpcy5fZW5hYmxlZCA9IEJvb2xlYW4oZW5hYmxlZCk7XHJcblxyXG4gICAgaWYgKCF0aGlzLl9lbmFibGVkKSB7XHJcbiAgICAgIHRoaXMucmVzZXQoKTtcclxuICAgICAgQnJvd3Nlck11bHRpRm9ybWF0Q29udGludW91c1JlYWRlci5yZWxlYXNlQWxsU3RyZWFtcygpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaWYgKHRoaXMuZGV2aWNlKSB7XHJcbiAgICAgICAgdGhpcy5zY2FuRnJvbURldmljZSh0aGlzLmRldmljZS5kZXZpY2VJZCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5pbml0KCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFRlbGxzIGlmIHRoZSBzY2FubmVyIGlzIGVuYWJsZWQgb3Igbm90LlxyXG4gICAqL1xyXG4gIGdldCBlbmFibGVkKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuX2VuYWJsZWQ7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJZiBpcyBgdHJ5SGFyZGVyYCBlbmFibGVkLlxyXG4gICAqL1xyXG4gIGdldCB0cnlIYXJkZXIoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5oaW50cy5nZXQoRGVjb2RlSGludFR5cGUuVFJZX0hBUkRFUik7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFbmFibGUvZGlzYWJsZSB0cnlIYXJkZXIgaGludC5cclxuICAgKi9cclxuICBASW5wdXQoKVxyXG4gIHNldCB0cnlIYXJkZXIoZW5hYmxlOiBib29sZWFuKSB7XHJcblxyXG4gICAgY29uc3QgaGludHMgPSB0aGlzLmhpbnRzO1xyXG5cclxuICAgIGlmIChlbmFibGUpIHtcclxuICAgICAgaGludHMuc2V0KERlY29kZUhpbnRUeXBlLlRSWV9IQVJERVIsIHRydWUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaGludHMuZGVsZXRlKERlY29kZUhpbnRUeXBlLlRSWV9IQVJERVIpO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuaGludHMgPSBoaW50cztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENvbnN0cnVjdG9yIHRvIGJ1aWxkIHRoZSBvYmplY3QgYW5kIGRvIHNvbWUgREkuXHJcbiAgICovXHJcbiAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAvLyBpbnN0YW5jZSBiYXNlZCBlbWl0dGVyc1xyXG4gICAgdGhpcy5hdXRvc3RhcnRlZCA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcclxuICAgIHRoaXMuYXV0b3N0YXJ0aW5nID0gbmV3IEV2ZW50RW1pdHRlcigpO1xyXG4gICAgdGhpcy50b3JjaENvbXBhdGlibGUgPSBuZXcgRXZlbnRFbWl0dGVyKGZhbHNlKTtcclxuICAgIHRoaXMuc2NhblN1Y2Nlc3MgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XHJcbiAgICB0aGlzLnNjYW5GYWlsdXJlID0gbmV3IEV2ZW50RW1pdHRlcigpO1xyXG4gICAgdGhpcy5zY2FuRXJyb3IgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XHJcbiAgICB0aGlzLnNjYW5Db21wbGV0ZSA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcclxuICAgIHRoaXMuY2FtZXJhc0ZvdW5kID0gbmV3IEV2ZW50RW1pdHRlcigpO1xyXG4gICAgdGhpcy5jYW1lcmFzTm90Rm91bmQgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XHJcbiAgICB0aGlzLnBlcm1pc3Npb25SZXNwb25zZSA9IG5ldyBFdmVudEVtaXR0ZXIodHJ1ZSk7XHJcbiAgICB0aGlzLmhhc0RldmljZXMgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XHJcbiAgICB0aGlzLmRldmljZUNoYW5nZSA9IG5ldyBFdmVudEVtaXR0ZXIoKTtcclxuXHJcbiAgICB0aGlzLl9lbmFibGVkID0gdHJ1ZTtcclxuICAgIHRoaXMuX2hpbnRzID0gbmV3IE1hcDxEZWNvZGVIaW50VHlwZSwgYW55PigpO1xyXG4gICAgdGhpcy5hdXRvZm9jdXNFbmFibGVkID0gdHJ1ZTtcclxuICAgIHRoaXMuYXV0b3N0YXJ0ID0gdHJ1ZTtcclxuICAgIHRoaXMuZm9ybWF0cyA9IFtCYXJjb2RlRm9ybWF0LlFSX0NPREVdO1xyXG5cclxuICAgIC8vIGNvbXB1dGVkIGRhdGFcclxuICAgIHRoaXMuaGFzTmF2aWdhdG9yID0gdHlwZW9mIG5hdmlnYXRvciAhPT0gJ3VuZGVmaW5lZCc7XHJcbiAgICB0aGlzLmlzTWVkaWFEZXZpY2VzU3VwcG9ydGVkID0gdGhpcy5oYXNOYXZpZ2F0b3IgJiYgISFuYXZpZ2F0b3IubWVkaWFEZXZpY2VzO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0cyBhbmQgcmVnaXN0ZXJzIGFsbCBjYW1lcmFzLlxyXG4gICAqL1xyXG4gIGFzeW5jIGFza0ZvclBlcm1pc3Npb24oKTogUHJvbWlzZTxib29sZWFuPiB7XHJcblxyXG4gICAgaWYgKCF0aGlzLmhhc05hdmlnYXRvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdAenhpbmcvbmd4LXNjYW5uZXInLCAnQ2FuXFwndCBhc2sgcGVybWlzc2lvbiwgbmF2aWdhdG9yIGlzIG5vdCBwcmVzZW50LicpO1xyXG4gICAgICB0aGlzLnNldFBlcm1pc3Npb24obnVsbCk7XHJcbiAgICAgIHJldHVybiB0aGlzLmhhc1Blcm1pc3Npb247XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCF0aGlzLmlzTWVkaWFEZXZpY2VzU3VwcG9ydGVkKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0B6eGluZy9uZ3gtc2Nhbm5lcicsICdDYW5cXCd0IGdldCB1c2VyIG1lZGlhLCB0aGlzIGlzIG5vdCBzdXBwb3J0ZWQuJyk7XHJcbiAgICAgIHRoaXMuc2V0UGVybWlzc2lvbihudWxsKTtcclxuICAgICAgcmV0dXJuIHRoaXMuaGFzUGVybWlzc2lvbjtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgc3RyZWFtOiBNZWRpYVN0cmVhbTtcclxuICAgIGxldCBwZXJtaXNzaW9uOiBib29sZWFuO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIFdpbGwgdHJ5IHRvIGFzayBmb3IgcGVybWlzc2lvblxyXG4gICAgICBzdHJlYW0gPSBhd2FpdCB0aGlzLmdldEFueVZpZGVvRGV2aWNlKCk7XHJcbiAgICAgIHBlcm1pc3Npb24gPSAhIXN0cmVhbTtcclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVQZXJtaXNzaW9uRXhjZXB0aW9uKGVycik7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICB0aGlzLnRlcm1pbmF0ZVN0cmVhbShzdHJlYW0pO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuc2V0UGVybWlzc2lvbihwZXJtaXNzaW9uKTtcclxuXHJcbiAgICAvLyBSZXR1cm5zIHRoZSBwZXJtaXNzaW9uXHJcbiAgICByZXR1cm4gcGVybWlzc2lvbjtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqXHJcbiAgICovXHJcbiAgZ2V0QW55VmlkZW9EZXZpY2UoKTogUHJvbWlzZTxNZWRpYVN0cmVhbT4ge1xyXG4gICAgcmV0dXJuIG5hdmlnYXRvci5tZWRpYURldmljZXMuZ2V0VXNlck1lZGlhKHsgdmlkZW86IHRydWUgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBUZXJtaW5hdGVzIGEgc3RyZWFtIGFuZCBpdCdzIHRyYWNrcy5cclxuICAgKi9cclxuICBwcml2YXRlIHRlcm1pbmF0ZVN0cmVhbShzdHJlYW06IE1lZGlhU3RyZWFtKSB7XHJcblxyXG4gICAgaWYgKHN0cmVhbSkge1xyXG4gICAgICBzdHJlYW0uZ2V0VHJhY2tzKCkuZm9yRWFjaCh0ID0+IHQuc3RvcCgpKTtcclxuICAgIH1cclxuXHJcbiAgICBzdHJlYW0gPSB1bmRlZmluZWQ7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIGluaXQoKSB7XHJcbiAgICBpZiAoIXRoaXMuYXV0b3N0YXJ0KSB7XHJcbiAgICAgIGNvbnNvbGUud2FybignRmVhdHVyZSBcXCdhdXRvc3RhcnRcXCcgZGlzYWJsZWQuIFBlcm1pc3Npb25zIGFuZCBkZXZpY2VzIHJlY292ZXJ5IGhhcyB0byBiZSBydW4gbWFudWFsbHkuJyk7XHJcblxyXG4gICAgICAvLyBkb2VzIHRoZSBuZWNlc3NhcnkgY29uZmlndXJhdGlvbiB3aXRob3V0IGF1dG9zdGFydGluZ1xyXG4gICAgICB0aGlzLmluaXRBdXRvc3RhcnRPZmYoKTtcclxuXHJcbiAgICAgIHRoaXMuX3JlYWR5ID0gdHJ1ZTtcclxuXHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBjb25maWd1cmVzIHRoZSBjb21wb25lbnQgYW5kIHN0YXJ0cyB0aGUgc2Nhbm5lclxyXG4gICAgYXdhaXQgdGhpcy5pbml0QXV0b3N0YXJ0T24oKTtcclxuXHJcbiAgICB0aGlzLl9yZWFkeSA9IHRydWU7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJbml0aWFsaXplcyB0aGUgY29tcG9uZW50IHdpdGhvdXQgc3RhcnRpbmcgdGhlIHNjYW5uZXIuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBpbml0QXV0b3N0YXJ0T2ZmKCk6IHZvaWQge1xyXG5cclxuICAgIC8vIGRvIG5vdCBhc2sgZm9yIHBlcm1pc3Npb24gd2hlbiBhdXRvc3RhcnQgaXMgb2ZmXHJcbiAgICB0aGlzLmlzQXV0b3N0YXJ0aW5nID0gZmFsc2U7XHJcblxyXG4gICAgLy8ganVzdCB1cGRhdGUgZGV2aWNlcyBpbmZvcm1hdGlvblxyXG4gICAgdGhpcy51cGRhdGVWaWRlb0lucHV0RGV2aWNlcygpO1xyXG5cclxuICAgIGlmICh0aGlzLl9kZXZpY2UgJiYgdGhpcy5fZGV2aWNlUHJlU3RhcnQpIHtcclxuICAgICAgdGhpcy5zZXREZXZpY2UodGhpcy5fZGV2aWNlUHJlU3RhcnQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSW5pdGlhbGl6ZXMgdGhlIGNvbXBvbmVudCBhbmQgc3RhcnRzIHRoZSBzY2FubmVyLlxyXG4gICAqIFBlcm1pc3Npb25zIGFyZSBhc2tlZCB0byBhY2NvbXBsaXNoIHRoYXQuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBpbml0QXV0b3N0YXJ0T24oKTogUHJvbWlzZTx2b2lkPiB7XHJcblxyXG4gICAgdGhpcy5pc0F1dG9zdGFydGluZyA9IHRydWU7XHJcblxyXG4gICAgbGV0IGhhc1Blcm1pc3Npb246IGJvb2xlYW47XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gQXNrcyBmb3IgcGVybWlzc2lvbiBiZWZvcmUgZW51bWVyYXRpbmcgZGV2aWNlcyBzbyBpdCBjYW4gZ2V0IGFsbCB0aGUgZGV2aWNlJ3MgaW5mb1xyXG4gICAgICBoYXNQZXJtaXNzaW9uID0gYXdhaXQgdGhpcy5hc2tGb3JQZXJtaXNzaW9uKCk7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0V4Y2VwdGlvbiBvY2N1cnJlZCB3aGlsZSBhc2tpbmcgZm9yIHBlcm1pc3Npb246JywgZSk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBmcm9tIHRoaXMgcG9pbnQsIHRoaW5ncyBnb25uYSBuZWVkIHBlcm1pc3Npb25zXHJcbiAgICBpZiAoaGFzUGVybWlzc2lvbikge1xyXG4gICAgICBjb25zdCBkZXZpY2VzID0gYXdhaXQgdGhpcy51cGRhdGVWaWRlb0lucHV0RGV2aWNlcygpO1xyXG4gICAgICBhd2FpdCB0aGlzLmF1dG9zdGFydFNjYW5uZXIoWy4uLmRldmljZXNdKTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmlzQXV0b3N0YXJ0aW5nID0gZmFsc2U7XHJcbiAgICB0aGlzLmF1dG9zdGFydGVkLm5leHQoKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrcyBpZiB0aGUgZ2l2ZW4gZGV2aWNlIGlzIHRoZSBjdXJyZW50IGRlZmluZWQgb25lLlxyXG4gICAqL1xyXG4gIGlzQ3VycmVudERldmljZShkZXZpY2U/OiBNZWRpYURldmljZUluZm8pIHtcclxuICAgIHJldHVybiBkZXZpY2U/LmRldmljZUlkID09PSB0aGlzLl9kZXZpY2U/LmRldmljZUlkO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRXhlY3V0ZXMgc29tZSBhY3Rpb25zIGJlZm9yZSBkZXN0cm95IHRoZSBjb21wb25lbnQuXHJcbiAgICovXHJcbiAgbmdPbkRlc3Ryb3koKTogdm9pZCB7XHJcbiAgICB0aGlzLnJlc2V0KCk7XHJcbiAgICBCcm93c2VyTXVsdGlGb3JtYXRDb250aW51b3VzUmVhZGVyLnJlbGVhc2VBbGxTdHJlYW1zKCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKlxyXG4gICAqL1xyXG4gIG5nT25Jbml0KCk6IHZvaWQge1xyXG4gICAgdGhpcy5pbml0KCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTdG9wcyB0aGUgc2Nhbm5pbmcsIGlmIGFueS5cclxuICAgKi9cclxuICBwdWJsaWMgc2NhblN0b3AoKSB7XHJcbiAgICBpZiAodGhpcy5fc2NhblN1YnNjcmlwdGlvbikge1xyXG4gICAgICB0aGlzLmNvZGVSZWFkZXI/LmdldFNjYW5uZXJDb250cm9scygpLnN0b3AoKTtcclxuICAgICAgdGhpcy5fc2NhblN1YnNjcmlwdGlvbj8udW5zdWJzY3JpYmUoKTtcclxuICAgICAgdGhpcy5fc2NhblN1YnNjcmlwdGlvbiA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuICAgIHRoaXMudG9yY2hDb21wYXRpYmxlLm5leHQoZmFsc2UpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU3RvcHMgdGhlIHNjYW5uaW5nLCBpZiBhbnkuXHJcbiAgICovXHJcbiAgcHVibGljIHNjYW5TdGFydCgpIHtcclxuXHJcbiAgICBpZiAodGhpcy5fc2NhblN1YnNjcmlwdGlvbikge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIGFscmVhZHkgYSBzY2FuIHByb2Nlc3MgcnVubmluZy4nKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXRoaXMuX2RldmljZSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGRldmljZSBkZWZpbmVkLCBjYW5ub3Qgc3RhcnQgc2NhbiwgcGxlYXNlIGRlZmluZSBhIGRldmljZS4nKTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLnNjYW5Gcm9tRGV2aWNlKHRoaXMuX2RldmljZS5kZXZpY2VJZCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTdG9wcyBvbGQgYGNvZGVSZWFkZXJgIGFuZCBzdGFydHMgc2Nhbm5pbmcgaW4gYSBuZXcgb25lLlxyXG4gICAqL1xyXG4gIHJlc3RhcnQoKTogdm9pZCB7XHJcbiAgICAvLyBub3RlIG9ubHkgbmVjZXNzYXJ5IGZvciBub3cgYmVjYXVzZSBvZiB0aGUgVG9yY2hcclxuICAgIHRoaXMuX2NvZGVSZWFkZXIgPSB1bmRlZmluZWQ7XHJcblxyXG4gICAgY29uc3QgcHJldkRldmljZSA9IHRoaXMuX3Jlc2V0KCk7XHJcblxyXG4gICAgaWYgKCFwcmV2RGV2aWNlKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmRldmljZSA9IHByZXZEZXZpY2U7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBEaXNjb3ZlcnMgYW5kIHVwZGF0ZXMga25vd24gdmlkZW8gaW5wdXQgZGV2aWNlcy5cclxuICAgKi9cclxuICBhc3luYyB1cGRhdGVWaWRlb0lucHV0RGV2aWNlcygpOiBQcm9taXNlPE1lZGlhRGV2aWNlSW5mb1tdPiB7XHJcblxyXG4gICAgLy8gcGVybWlzc2lvbnMgYXJlbid0IG5lZWRlZCB0byBnZXQgZGV2aWNlcywgYnV0IHRvIGFjY2VzcyB0aGVtIGFuZCB0aGVpciBpbmZvXHJcbiAgICBjb25zdCBkZXZpY2VzID0gYXdhaXQgQnJvd3NlckNvZGVSZWFkZXIubGlzdFZpZGVvSW5wdXREZXZpY2VzKCkgfHwgW107XHJcbiAgICBjb25zdCBoYXNEZXZpY2VzID0gZGV2aWNlcyAmJiBkZXZpY2VzLmxlbmd0aCA+IDA7XHJcblxyXG4gICAgLy8gc3RvcmVzIGRpc2NvdmVyZWQgZGV2aWNlcyBhbmQgdXBkYXRlcyBpbmZvcm1hdGlvblxyXG4gICAgdGhpcy5oYXNEZXZpY2VzLm5leHQoaGFzRGV2aWNlcyk7XHJcbiAgICB0aGlzLmNhbWVyYXNGb3VuZC5uZXh0KFsuLi5kZXZpY2VzXSk7XHJcblxyXG4gICAgaWYgKCFoYXNEZXZpY2VzKSB7XHJcbiAgICAgIHRoaXMuY2FtZXJhc05vdEZvdW5kLm5leHQobnVsbCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGRldmljZXM7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTdGFydHMgdGhlIHNjYW5uZXIgd2l0aCB0aGUgYmFjayBjYW1lcmEgb3RoZXJ3aXNlIHRha2UgdGhlIGxhc3RcclxuICAgKiBhdmFpbGFibGUgZGV2aWNlLlxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgYXV0b3N0YXJ0U2Nhbm5lcihkZXZpY2VzOiBNZWRpYURldmljZUluZm9bXSk6IFByb21pc2U8dm9pZD4ge1xyXG5cclxuICAgIGNvbnN0IG1hdGNoZXIgPSAoeyBsYWJlbCB9KSA9PiAvYmFja3x0csOhc3xyZWFyfHRyYXNlaXJhfGVudmlyb25tZW50fGFtYmllbnRlL2dpLnRlc3QobGFiZWwpO1xyXG5cclxuICAgIC8vIHNlbGVjdCB0aGUgcmVhciBjYW1lcmEgYnkgZGVmYXVsdCwgb3RoZXJ3aXNlIHRha2UgdGhlIGxhc3QgY2FtZXJhLlxyXG4gICAgY29uc3QgZGV2aWNlID0gZGV2aWNlcy5maW5kKG1hdGNoZXIpIHx8IGRldmljZXMucG9wKCk7XHJcblxyXG4gICAgaWYgKCFkZXZpY2UpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbXBvc3NpYmxlIHRvIGF1dG9zdGFydCwgbm8gaW5wdXQgZGV2aWNlcyBhdmFpbGFibGUuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgdGhpcy5zZXREZXZpY2UoZGV2aWNlKTtcclxuXHJcbiAgICB0aGlzLmRldmljZUNoYW5nZS5uZXh0KGRldmljZSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBEaXNwYXRjaGVzIHRoZSBzY2FuIHN1Y2Nlc3MgZXZlbnQuXHJcbiAgICpcclxuICAgKiBAcGFyYW0gcmVzdWx0IHRoZSBzY2FuIHJlc3VsdC5cclxuICAgKi9cclxuICBwcml2YXRlIGRpc3BhdGNoU2NhblN1Y2Nlc3MocmVzdWx0OiBSZXN1bHQpOiB2b2lkIHtcclxuICAgIHRoaXMuc2NhblN1Y2Nlc3MubmV4dChyZXN1bHQuZ2V0VGV4dCgpKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIERpc3BhdGNoZXMgdGhlIHNjYW4gZmFpbHVyZSBldmVudC5cclxuICAgKi9cclxuICBwcml2YXRlIGRpc3BhdGNoU2NhbkZhaWx1cmUocmVhc29uPzogRXhjZXB0aW9uKTogdm9pZCB7XHJcbiAgICB0aGlzLnNjYW5GYWlsdXJlLm5leHQocmVhc29uKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIERpc3BhdGNoZXMgdGhlIHNjYW4gZXJyb3IgZXZlbnQuXHJcbiAgICpcclxuICAgKiBAcGFyYW0gZXJyb3IgdGhlIGVycm9yIHRoaW5nLlxyXG4gICAqL1xyXG4gIHByaXZhdGUgZGlzcGF0Y2hTY2FuRXJyb3IoZXJyb3I6IGFueSk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLnNjYW5FcnJvci5vYnNlcnZlZCkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGB6eGluZyBzY2FubmVyIGNvbXBvbmVudDogJHtlcnJvci5uYW1lfWAsIGVycm9yKTtcclxuICAgICAgY29uc29sZS53YXJuKCdVc2UgdGhlIGAoc2NhbkVycm9yKWAgcHJvcGVydHkgdG8gaGFuZGxlIGVycm9ycyBsaWtlIHRoaXMhJyk7XHJcbiAgICB9XHJcbiAgICB0aGlzLnNjYW5FcnJvci5uZXh0KGVycm9yKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIERpc3BhdGNoZXMgdGhlIHNjYW4gZXZlbnQuXHJcbiAgICpcclxuICAgKiBAcGFyYW0gcmVzdWx0IHRoZSBzY2FuIHJlc3VsdC5cclxuICAgKi9cclxuICBwcml2YXRlIGRpc3BhdGNoU2NhbkNvbXBsZXRlKHJlc3VsdDogUmVzdWx0KTogdm9pZCB7XHJcbiAgICB0aGlzLnNjYW5Db21wbGV0ZS5uZXh0KHJlc3VsdCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZXR1cm5zIHRoZSBmaWx0ZXJlZCBwZXJtaXNzaW9uLlxyXG4gICAqL1xyXG4gIHByaXZhdGUgaGFuZGxlUGVybWlzc2lvbkV4Y2VwdGlvbihlcnI6IERPTUV4Y2VwdGlvbik6IGJvb2xlYW4ge1xyXG5cclxuICAgIC8vIGZhaWxlZCB0byBncmFudCBwZXJtaXNzaW9uIHRvIHZpZGVvIGlucHV0XHJcbiAgICBjb25zb2xlLmVycm9yKCdAenhpbmcvbmd4LXNjYW5uZXInLCAnRXJyb3Igd2hlbiBhc2tpbmcgZm9yIHBlcm1pc3Npb24uJywgZXJyKTtcclxuXHJcbiAgICBsZXQgcGVybWlzc2lvbjogYm9vbGVhbjtcclxuXHJcbiAgICBzd2l0Y2ggKGVyci5uYW1lKSB7XHJcblxyXG4gICAgICAvLyB1c3VhbGx5IGNhdXNlZCBieSBub3Qgc2VjdXJlIG9yaWdpbnNcclxuICAgICAgY2FzZSAnTm90U3VwcG9ydGVkRXJyb3InOlxyXG4gICAgICAgIGNvbnNvbGUud2FybignQHp4aW5nL25neC1zY2FubmVyJywgZXJyLm1lc3NhZ2UpO1xyXG4gICAgICAgIC8vIGNvdWxkIG5vdCBjbGFpbVxyXG4gICAgICAgIHBlcm1pc3Npb24gPSBudWxsO1xyXG4gICAgICAgIC8vIGNhbid0IGNoZWNrIGRldmljZXNcclxuICAgICAgICB0aGlzLmhhc0RldmljZXMubmV4dChudWxsKTtcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIC8vIHVzZXIgZGVuaWVkIHBlcm1pc3Npb25cclxuICAgICAgY2FzZSAnTm90QWxsb3dlZEVycm9yJzpcclxuICAgICAgICBjb25zb2xlLndhcm4oJ0B6eGluZy9uZ3gtc2Nhbm5lcicsIGVyci5tZXNzYWdlKTtcclxuICAgICAgICAvLyBjbGFpbWVkIGFuZCBkZW5pZWQgcGVybWlzc2lvblxyXG4gICAgICAgIHBlcm1pc3Npb24gPSBmYWxzZTtcclxuICAgICAgICAvLyB0aGlzIG1lYW5zIHRoYXQgaW5wdXQgZGV2aWNlcyBleGlzdHNcclxuICAgICAgICB0aGlzLmhhc0RldmljZXMubmV4dCh0cnVlKTtcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIC8vIHRoZSBkZXZpY2UgaGFzIG5vIGF0dGFjaGVkIGlucHV0IGRldmljZXNcclxuICAgICAgY2FzZSAnTm90Rm91bmRFcnJvcic6XHJcbiAgICAgICAgY29uc29sZS53YXJuKCdAenhpbmcvbmd4LXNjYW5uZXInLCBlcnIubWVzc2FnZSk7XHJcbiAgICAgICAgLy8gbm8gcGVybWlzc2lvbnMgY2xhaW1lZFxyXG4gICAgICAgIHBlcm1pc3Npb24gPSBudWxsO1xyXG4gICAgICAgIC8vIGJlY2F1c2UgdGhlcmUgd2FzIG5vIGRldmljZXNcclxuICAgICAgICB0aGlzLmhhc0RldmljZXMubmV4dChmYWxzZSk7XHJcbiAgICAgICAgLy8gdGVsbHMgdGhlIGxpc3RlbmVyIGFib3V0IHRoZSBlcnJvclxyXG4gICAgICAgIHRoaXMuY2FtZXJhc05vdEZvdW5kLm5leHQoZXJyKTtcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIGNhc2UgJ05vdFJlYWRhYmxlRXJyb3InOlxyXG4gICAgICAgIGNvbnNvbGUud2FybignQHp4aW5nL25neC1zY2FubmVyJywgJ0NvdWxkblxcJ3QgcmVhZCB0aGUgZGV2aWNlKHMpXFwncyBzdHJlYW0sIGl0XFwncyBwcm9iYWJseSBpbiB1c2UgYnkgYW5vdGhlciBhcHAuJyk7XHJcbiAgICAgICAgLy8gbm8gcGVybWlzc2lvbnMgY2xhaW1lZFxyXG4gICAgICAgIHBlcm1pc3Npb24gPSBudWxsO1xyXG4gICAgICAgIC8vIHRoZXJlIGFyZSBkZXZpY2VzLCB3aGljaCBJIGNvdWxkbid0IHVzZVxyXG4gICAgICAgIHRoaXMuaGFzRGV2aWNlcy5uZXh0KGZhbHNlKTtcclxuICAgICAgICAvLyB0ZWxscyB0aGUgbGlzdGVuZXIgYWJvdXQgdGhlIGVycm9yXHJcbiAgICAgICAgdGhpcy5jYW1lcmFzTm90Rm91bmQubmV4dChlcnIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICBjb25zb2xlLndhcm4oJ0B6eGluZy9uZ3gtc2Nhbm5lcicsICdJIHdhcyBub3QgYWJsZSB0byBkZWZpbmUgaWYgSSBoYXZlIHBlcm1pc3Npb25zIGZvciBjYW1lcmEgb3Igbm90LicsIGVycik7XHJcbiAgICAgICAgLy8gdW5rbm93blxyXG4gICAgICAgIHBlcm1pc3Npb24gPSBudWxsO1xyXG4gICAgICAgIC8vIHRoaXMuaGFzRGV2aWNlcy5uZXh0KHVuZGVmaW5lZDtcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5zZXRQZXJtaXNzaW9uKHBlcm1pc3Npb24pO1xyXG5cclxuICAgIC8vIHRlbGxzIHRoZSBsaXN0ZW5lciBhYm91dCB0aGUgZXJyb3JcclxuICAgIHRoaXMucGVybWlzc2lvblJlc3BvbnNlLmVycm9yKGVycik7XHJcblxyXG4gICAgcmV0dXJuIHBlcm1pc3Npb247XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZXR1cm5zIGEgdmFsaWQgQmFyY29kZUZvcm1hdCBvciBmYWlscy5cclxuICAgKi9cclxuICBwcml2YXRlIGdldEJhcmNvZGVGb3JtYXRPckZhaWwoZm9ybWF0OiBzdHJpbmcgfCBCYXJjb2RlRm9ybWF0KTogQmFyY29kZUZvcm1hdCB7XHJcbiAgICByZXR1cm4gdHlwZW9mIGZvcm1hdCA9PT0gJ3N0cmluZydcclxuICAgICAgPyBCYXJjb2RlRm9ybWF0W2Zvcm1hdC50cmltKCkudG9VcHBlckNhc2UoKV1cclxuICAgICAgOiBmb3JtYXQ7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZXR1cm4gYSBjb2RlIHJlYWRlciwgY3JlYXRlIG9uZSBpZiBub24gZXhpc3RcclxuICAgKi9cclxuICBwcml2YXRlIGdldENvZGVSZWFkZXIoKTogQnJvd3Nlck11bHRpRm9ybWF0Q29udGludW91c1JlYWRlciB7XHJcblxyXG4gICAgaWYgKCF0aGlzLl9jb2RlUmVhZGVyKSB7XHJcbiAgICAgIGNvbnN0IG9wdGlvbnMgPSB7XHJcbiAgICAgICAgZGVsYXlCZXR3ZWVuU2NhbkF0dGVtcHRzOiB0aGlzLnRpbWVCZXR3ZWVuU2NhbnMsXHJcbiAgICAgICAgZGVsYXlCZXR3ZWVuU2NhblN1Y2Nlc3M6IHRoaXMuZGVsYXlCZXR3ZWVuU2NhblN1Y2Nlc3NcclxuICAgICAgfTtcclxuICAgICAgdGhpcy5fY29kZVJlYWRlciA9IG5ldyBCcm93c2VyTXVsdGlGb3JtYXRDb250aW51b3VzUmVhZGVyKHRoaXMuaGludHMsIG9wdGlvbnMpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB0aGlzLl9jb2RlUmVhZGVyO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU3RhcnRzIHRoZSBjb250aW51b3VzIHNjYW5uaW5nIGZvciB0aGUgZ2l2ZW4gZGV2aWNlLlxyXG4gICAqXHJcbiAgICogQHBhcmFtIGRldmljZUlkIFRoZSBkZXZpY2VJZCBmcm9tIHRoZSBkZXZpY2UuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBzY2FuRnJvbURldmljZShkZXZpY2VJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcblxyXG4gICAgY29uc3QgdmlkZW9FbGVtZW50ID0gdGhpcy5wcmV2aWV3RWxlbVJlZi5uYXRpdmVFbGVtZW50O1xyXG5cclxuICAgIGNvbnN0IGNvZGVSZWFkZXIgPSB0aGlzLmdldENvZGVSZWFkZXIoKTtcclxuXHJcbiAgICBjb25zdCBzY2FuU3RyZWFtID0gYXdhaXQgY29kZVJlYWRlci5zY2FuRnJvbURldmljZU9ic2VydmFibGUoZGV2aWNlSWQsIHZpZGVvRWxlbWVudCk7XHJcblxyXG4gICAgaWYgKCFzY2FuU3RyZWFtKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5kZWZpbmVkIGRlY29kaW5nIHN0cmVhbSwgYWJvcnRpbmcuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbmV4dCA9ICh4OiBSZXN1bHRBbmRFcnJvcikgPT4gdGhpcy5fb25EZWNvZGVSZXN1bHQoeC5yZXN1bHQsIHguZXJyb3IpO1xyXG4gICAgY29uc3QgZXJyb3IgPSAoZXJyOiBhbnkpID0+IHRoaXMuX29uRGVjb2RlRXJyb3IoZXJyKTtcclxuICAgIGNvbnN0IGNvbXBsZXRlID0gKCkgPT4ge1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLl9zY2FuU3Vic2NyaXB0aW9uID0gc2NhblN0cmVhbS5zdWJzY3JpYmUobmV4dCwgZXJyb3IsIGNvbXBsZXRlKTtcclxuXHJcbiAgICBpZiAodGhpcy5fc2NhblN1YnNjcmlwdGlvbi5jbG9zZWQpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNvbnRyb2xzID0gY29kZVJlYWRlci5nZXRTY2FubmVyQ29udHJvbHMoKTtcclxuICAgIGNvbnN0IGhhc1RvcmNoQ29udHJvbCA9IHR5cGVvZiBjb250cm9scy5zd2l0Y2hUb3JjaCAhPT0gJ3VuZGVmaW5lZCc7XHJcblxyXG4gICAgdGhpcy50b3JjaENvbXBhdGlibGUubmV4dChoYXNUb3JjaENvbnRyb2wpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSGFuZGxlcyBkZWNvZGUgZXJyb3JzLlxyXG4gICAqL1xyXG4gIHByaXZhdGUgX29uRGVjb2RlRXJyb3IoZXJyOiBhbnkpIHtcclxuICAgIHRoaXMuZGlzcGF0Y2hTY2FuRXJyb3IoZXJyKTtcclxuICAgIC8vIHRoaXMucmVzZXQoKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEhhbmRsZXMgZGVjb2RlIHJlc3VsdHMuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBfb25EZWNvZGVSZXN1bHQocmVzdWx0OiBSZXN1bHQsIGVycm9yOiBFeGNlcHRpb24pOiB2b2lkIHtcclxuXHJcbiAgICBpZiAocmVzdWx0KSB7XHJcbiAgICAgIHRoaXMuZGlzcGF0Y2hTY2FuU3VjY2VzcyhyZXN1bHQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5kaXNwYXRjaFNjYW5GYWlsdXJlKGVycm9yKTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmRpc3BhdGNoU2NhbkNvbXBsZXRlKHJlc3VsdCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTdG9wcyB0aGUgY29kZSByZWFkZXIgYW5kIHJldHVybnMgdGhlIHByZXZpb3VzIHNlbGVjdGVkIGRldmljZS5cclxuICAgKi9cclxuICBwcml2YXRlIF9yZXNldCgpOiBNZWRpYURldmljZUluZm8ge1xyXG5cclxuICAgIGlmICghdGhpcy5fY29kZVJlYWRlcikge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gY2xlYXJpbmcgY29kZVJlYWRlciBmaXJzdCB0byBwcmV2ZW50IHNldE9wdGlvbnMgZXJyb3IgYXBwZWFyaW5nIGluIHNldmVyYWwgQ2hyb21pdW0gdmVyc2lvbnNcclxuICAgIHRoaXMuX2NvZGVSZWFkZXIgPSB1bmRlZmluZWQ7XHJcblxyXG4gICAgY29uc3QgZGV2aWNlID0gdGhpcy5fZGV2aWNlO1xyXG4gICAgLy8gZG8gbm90IHNldCB0aGlzLmRldmljZSBpbnNpZGUgdGhpcyBtZXRob2QsIGl0IHdvdWxkIGNyZWF0ZSBhIHJlY3Vyc2l2ZSBsb29wXHJcbiAgICB0aGlzLmRldmljZSA9IHVuZGVmaW5lZDtcclxuXHJcblxyXG4gICAgcmV0dXJuIGRldmljZTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJlc2V0cyB0aGUgc2Nhbm5lciBhbmQgZW1pdHMgZGV2aWNlIGNoYW5nZS5cclxuICAgKi9cclxuICBwdWJsaWMgcmVzZXQoKTogdm9pZCB7XHJcbiAgICB0aGlzLl9yZXNldCgpO1xyXG4gICAgdGhpcy5kZXZpY2VDaGFuZ2UuZW1pdChudWxsKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNldHMgdGhlIGN1cnJlbnQgZGV2aWNlLlxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgc2V0RGV2aWNlKGRldmljZTogTWVkaWFEZXZpY2VJbmZvKTogUHJvbWlzZTx2b2lkPiB7XHJcblxyXG4gICAgLy8gaW5zdGFudGx5IHN0b3BzIHRoZSBzY2FuIGJlZm9yZSBjaGFuZ2luZyBkZXZpY2VzXHJcbiAgICB0aGlzLnNjYW5TdG9wKCk7XHJcblxyXG4gICAgLy8gY29ycmVjdGx5IHNldHMgdGhlIG5ldyAob3Igbm9uZSkgZGV2aWNlXHJcbiAgICB0aGlzLl9kZXZpY2UgPSBkZXZpY2UgfHwgdW5kZWZpbmVkO1xyXG5cclxuICAgIGlmICghdGhpcy5fZGV2aWNlKSB7XHJcbiAgICAgIC8vIGNsZWFucyB0aGUgdmlkZW8gYmVjYXVzZSB1c2VyIHJlbW92ZWQgdGhlIGRldmljZVxyXG4gICAgICBCcm93c2VyQ29kZVJlYWRlci5jbGVhblZpZGVvU291cmNlKHRoaXMucHJldmlld0VsZW1SZWYubmF0aXZlRWxlbWVudCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gaWYgZW5hYmxlZCwgc3RhcnRzIHNjYW5uaW5nXHJcbiAgICBpZiAodGhpcy5fZW5hYmxlZCAmJiBkZXZpY2UpIHtcclxuICAgICAgYXdhaXQgdGhpcy5zY2FuRnJvbURldmljZShkZXZpY2UuZGV2aWNlSWQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU2V0cyB0aGUgcGVybWlzc2lvbiB2YWx1ZSBhbmQgZW1pdHMgdGhlIGV2ZW50LlxyXG4gICAqL1xyXG4gIHByaXZhdGUgc2V0UGVybWlzc2lvbihoYXNQZXJtaXNzaW9uOiBib29sZWFuIHwgbnVsbCk6IHZvaWQge1xyXG4gICAgdGhpcy5oYXNQZXJtaXNzaW9uID0gaGFzUGVybWlzc2lvbjtcclxuICAgIHRoaXMucGVybWlzc2lvblJlc3BvbnNlLm5leHQoaGFzUGVybWlzc2lvbik7XHJcbiAgfVxyXG5cclxufVxyXG4iLCI8dmlkZW8gI3ByZXZpZXcgW3N0eWxlLm9iamVjdC1maXRdPVwicHJldmlld0ZpdE1vZGVcIiBbcG9zdGVyXT1cInBvc3RlclwiPlxyXG4gIDxwPlxyXG4gICAgWW91ciBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgdGhpcyBmZWF0dXJlLCBwbGVhc2UgdHJ5IHRvIHVwZ3JhZGUgaXQuXHJcbiAgPC9wPlxyXG4gIDxwPlxyXG4gICAgU2V1IG5hdmVnYWRvciBuw6NvIHN1cG9ydGEgZXN0ZSByZWN1cnNvLCBwb3IgZmF2b3IgdGVudGUgYXR1YWxpesOhLWxvLlxyXG4gIDwvcD5cclxuPC92aWRlbz5cclxuIl19