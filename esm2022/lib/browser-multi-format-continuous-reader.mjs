import { ChecksumException, FormatException, NotFoundException } from '@zxing/library';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BehaviorSubject } from 'rxjs';
/**
 * Based on zxing-typescript BrowserCodeReader
 */
export class BrowserMultiFormatContinuousReader extends BrowserMultiFormatReader {
    /**
     * Returns the code reader scanner controls.
     */
    getScannerControls() {
        if (!this.scannerControls) {
            throw new Error('No scanning is running at the time.');
        }
        return this.scannerControls;
    }
    /**
     * Starts the decoding from the current or a new video element.
     *
     * @param deviceId The device's to be used Id
     * @param previewEl A new video element
     */
    async scanFromDeviceObservable(deviceId, previewEl) {
        const scan$ = new BehaviorSubject({});
        let ctrls;
        try {
            ctrls = await this.decodeFromVideoDevice(deviceId, previewEl, (result, error) => {
                if (!error) {
                    scan$.next({ result });
                    return;
                }
                const errorName = error.name;
                // stream cannot stop on fails.
                if (
                // scan Failure - found nothing, no error
                errorName === NotFoundException.name ||
                    // scan Error - found the QR but got error on decoding
                    errorName === ChecksumException.name ||
                    errorName === FormatException.name ||
                    error.message.includes('No MultiFormat Readers were able to detect the code.')) {
                    scan$.next({ error });
                    return;
                }
                // probably fatal error
                scan$.error(error);
                this.scannerControls.stop();
                this.scannerControls = undefined;
                return;
            });
            this.scannerControls = {
                ...ctrls,
                stop() {
                    ctrls.stop();
                    scan$.complete();
                },
            };
        }
        catch (e) {
            scan$.error(e);
            this.scannerControls?.stop();
            this.scannerControls = undefined;
        }
        return scan$.asObservable();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci1tdWx0aS1mb3JtYXQtY29udGludW91cy1yZWFkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9wcm9qZWN0cy96eGluZy1zY2FubmVyL3NyYy9saWIvYnJvd3Nlci1tdWx0aS1mb3JtYXQtY29udGludW91cy1yZWFkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSx3QkFBd0IsRUFBb0IsTUFBTSxnQkFBZ0IsQ0FBQztBQUM1RSxPQUFPLEVBQUUsZUFBZSxFQUFjLE1BQU0sTUFBTSxDQUFDO0FBR25EOztHQUVHO0FBQ0gsTUFBTSxPQUFPLGtDQUFtQyxTQUFRLHdCQUF3QjtJQVE5RTs7T0FFRztJQUNJLGtCQUFrQjtRQUN2QixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRTtZQUN6QixNQUFNLElBQUksS0FBSyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7U0FDeEQ7UUFDRCxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUM7SUFDOUIsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0ksS0FBSyxDQUFDLHdCQUF3QixDQUNuQyxRQUFpQixFQUNqQixTQUE0QjtRQUc1QixNQUFNLEtBQUssR0FBRyxJQUFJLGVBQWUsQ0FBaUIsRUFBRSxDQUFDLENBQUM7UUFDdEQsSUFBSSxLQUFLLENBQUM7UUFFVixJQUFJO1lBQ0YsS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUU7Z0JBRTlFLElBQUksQ0FBQyxLQUFLLEVBQUU7b0JBQ1YsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7b0JBQ3ZCLE9BQU87aUJBQ1I7Z0JBRUQsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztnQkFFN0IsK0JBQStCO2dCQUMvQjtnQkFDRSx5Q0FBeUM7Z0JBQ3pDLFNBQVMsS0FBSyxpQkFBaUIsQ0FBQyxJQUFJO29CQUNwQyxzREFBc0Q7b0JBQ3RELFNBQVMsS0FBSyxpQkFBaUIsQ0FBQyxJQUFJO29CQUNwQyxTQUFTLEtBQUssZUFBZSxDQUFDLElBQUk7b0JBQ2xDLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLHNEQUFzRCxDQUFDLEVBQzlFO29CQUNBLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO29CQUN0QixPQUFPO2lCQUNSO2dCQUVELHVCQUF1QjtnQkFDdkIsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDbkIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDNUIsSUFBSSxDQUFDLGVBQWUsR0FBRyxTQUFTLENBQUM7Z0JBQ2pDLE9BQU87WUFDVCxDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxlQUFlLEdBQUc7Z0JBQ3JCLEdBQUcsS0FBSztnQkFDUixJQUFJO29CQUNGLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDYixLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ25CLENBQUM7YUFDRixDQUFDO1NBQ0g7UUFBQyxPQUFPLENBQUMsRUFBRTtZQUNWLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDZixJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxlQUFlLEdBQUcsU0FBUyxDQUFDO1NBQ2xDO1FBRUQsT0FBTyxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUM7SUFDOUIsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ2hlY2tzdW1FeGNlcHRpb24sIEZvcm1hdEV4Y2VwdGlvbiwgTm90Rm91bmRFeGNlcHRpb24gfSBmcm9tICdAenhpbmcvbGlicmFyeSc7XHJcbmltcG9ydCB7IEJyb3dzZXJNdWx0aUZvcm1hdFJlYWRlciwgSVNjYW5uZXJDb250cm9scyB9IGZyb20gJ0B6eGluZy9icm93c2VyJztcclxuaW1wb3J0IHsgQmVoYXZpb3JTdWJqZWN0LCBPYnNlcnZhYmxlIH0gZnJvbSAncnhqcyc7XHJcbmltcG9ydCB7IFJlc3VsdEFuZEVycm9yIH0gZnJvbSAnLi9SZXN1bHRBbmRFcnJvcic7XHJcblxyXG4vKipcclxuICogQmFzZWQgb24genhpbmctdHlwZXNjcmlwdCBCcm93c2VyQ29kZVJlYWRlclxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIEJyb3dzZXJNdWx0aUZvcm1hdENvbnRpbnVvdXNSZWFkZXIgZXh0ZW5kcyBCcm93c2VyTXVsdGlGb3JtYXRSZWFkZXIge1xyXG5cclxuICAvKipcclxuICAgKiBBbGxvd3MgdG8gY2FsbCBzY2FubmVyIGNvbnRyb2xzIEFQSSB3aGlsZSBzY2FubmluZy5cclxuICAgKiBXaWxsIGJlIHVuZGVmaW5lZCBpZiBubyBzY2FubmluZyBpcyBydW5uaW5nLlxyXG4gICAqL1xyXG4gIHByb3RlY3RlZCBzY2FubmVyQ29udHJvbHM6IElTY2FubmVyQ29udHJvbHM7XHJcblxyXG4gIC8qKlxyXG4gICAqIFJldHVybnMgdGhlIGNvZGUgcmVhZGVyIHNjYW5uZXIgY29udHJvbHMuXHJcbiAgICovXHJcbiAgcHVibGljIGdldFNjYW5uZXJDb250cm9scygpOiBJU2Nhbm5lckNvbnRyb2xzIHtcclxuICAgIGlmICghdGhpcy5zY2FubmVyQ29udHJvbHMpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBzY2FubmluZyBpcyBydW5uaW5nIGF0IHRoZSB0aW1lLicpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuc2Nhbm5lckNvbnRyb2xzO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU3RhcnRzIHRoZSBkZWNvZGluZyBmcm9tIHRoZSBjdXJyZW50IG9yIGEgbmV3IHZpZGVvIGVsZW1lbnQuXHJcbiAgICpcclxuICAgKiBAcGFyYW0gZGV2aWNlSWQgVGhlIGRldmljZSdzIHRvIGJlIHVzZWQgSWRcclxuICAgKiBAcGFyYW0gcHJldmlld0VsIEEgbmV3IHZpZGVvIGVsZW1lbnRcclxuICAgKi9cclxuICBwdWJsaWMgYXN5bmMgc2NhbkZyb21EZXZpY2VPYnNlcnZhYmxlKFxyXG4gICAgZGV2aWNlSWQ/OiBzdHJpbmcsXHJcbiAgICBwcmV2aWV3RWw/OiBIVE1MVmlkZW9FbGVtZW50XHJcbiAgKTogUHJvbWlzZTxPYnNlcnZhYmxlPFJlc3VsdEFuZEVycm9yPj4ge1xyXG5cclxuICAgIGNvbnN0IHNjYW4kID0gbmV3IEJlaGF2aW9yU3ViamVjdDxSZXN1bHRBbmRFcnJvcj4oe30pO1xyXG4gICAgbGV0IGN0cmxzO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGN0cmxzID0gYXdhaXQgdGhpcy5kZWNvZGVGcm9tVmlkZW9EZXZpY2UoZGV2aWNlSWQsIHByZXZpZXdFbCwgKHJlc3VsdCwgZXJyb3IpID0+IHtcclxuXHJcbiAgICAgICAgaWYgKCFlcnJvcikge1xyXG4gICAgICAgICAgc2NhbiQubmV4dCh7IHJlc3VsdCB9KTtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGVycm9yTmFtZSA9IGVycm9yLm5hbWU7XHJcblxyXG4gICAgICAgIC8vIHN0cmVhbSBjYW5ub3Qgc3RvcCBvbiBmYWlscy5cclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICAvLyBzY2FuIEZhaWx1cmUgLSBmb3VuZCBub3RoaW5nLCBubyBlcnJvclxyXG4gICAgICAgICAgZXJyb3JOYW1lID09PSBOb3RGb3VuZEV4Y2VwdGlvbi5uYW1lIHx8XHJcbiAgICAgICAgICAvLyBzY2FuIEVycm9yIC0gZm91bmQgdGhlIFFSIGJ1dCBnb3QgZXJyb3Igb24gZGVjb2RpbmdcclxuICAgICAgICAgIGVycm9yTmFtZSA9PT0gQ2hlY2tzdW1FeGNlcHRpb24ubmFtZSB8fFxyXG4gICAgICAgICAgZXJyb3JOYW1lID09PSBGb3JtYXRFeGNlcHRpb24ubmFtZSB8fFxyXG4gICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnTm8gTXVsdGlGb3JtYXQgUmVhZGVycyB3ZXJlIGFibGUgdG8gZGV0ZWN0IHRoZSBjb2RlLicpXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICBzY2FuJC5uZXh0KHsgZXJyb3IgfSk7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBwcm9iYWJseSBmYXRhbCBlcnJvclxyXG4gICAgICAgIHNjYW4kLmVycm9yKGVycm9yKTtcclxuICAgICAgICB0aGlzLnNjYW5uZXJDb250cm9scy5zdG9wKCk7XHJcbiAgICAgICAgdGhpcy5zY2FubmVyQ29udHJvbHMgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHRoaXMuc2Nhbm5lckNvbnRyb2xzID0ge1xyXG4gICAgICAgIC4uLmN0cmxzLFxyXG4gICAgICAgIHN0b3AoKSB7XHJcbiAgICAgICAgICBjdHJscy5zdG9wKCk7XHJcbiAgICAgICAgICBzY2FuJC5jb21wbGV0ZSgpO1xyXG4gICAgICAgIH0sXHJcbiAgICAgIH07XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgIHNjYW4kLmVycm9yKGUpO1xyXG4gICAgICB0aGlzLnNjYW5uZXJDb250cm9scz8uc3RvcCgpO1xyXG4gICAgICB0aGlzLnNjYW5uZXJDb250cm9scyA9IHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gc2NhbiQuYXNPYnNlcnZhYmxlKCk7XHJcbiAgfVxyXG59XHJcbiJdfQ==